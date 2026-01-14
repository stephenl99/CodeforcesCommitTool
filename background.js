// Background script for GitHub API calls and Codeforces fetching
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'uploadToGitHub') {
        handleGitHubUpload(request.data)
            .then(result => sendResponse({ success: true, result }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep message channel open for async response
    }
    
    if (request.action === 'fetchSubmissionCode') {
        handleFetchSubmissionCode(request.url)
            .then(code => sendResponse({ success: true, code }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep message channel open for async response
    }
    
    if (request.action === 'fetchSubmissions') {
        handleFetchSubmissions(request.count, request.max, request.tabId)
            .then(result => sendResponse({ success: true, count: result.count }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Keep message channel open for async response
    }
});

async function handleGitHubUpload(data) {
    const { filename, code, username, token, commitMsg, sha, repo } = data;
    
    // URL encode the filename to handle special characters
    const encodedFilename = encodeURIComponent(filename);
    let url = `https://api.github.com/repos/${username}/${repo}/contents/${encodedFilename}`;
    
    // If SHA not provided, check if file exists to get SHA for update
    let fileSha = sha;
    if (!fileSha) {
        try {
            const checkResponse = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': `token ${token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });
            
            if (checkResponse.ok) {
                const fileData = await checkResponse.json();
                fileSha = fileData.sha;
            } else if (checkResponse.status !== 404) {
                // If it's not a 404, there's a real error
                const error = await checkResponse.json().catch(() => ({}));
                throw new Error(`GitHub API error checking file: ${checkResponse.status} - ${JSON.stringify(error)}`);
            }
            // 404 is fine - file doesn't exist, we'll create it
        } catch (error) {
            // If check fails, continue anyway - might be a new file
            console.log('Could not check file existence, proceeding with upload:', error.message);
        }
    }
    
    let requestData = {
        message: commitMsg,
        content: code,
        branch: 'main'
    };
    
    if (fileSha) {
        requestData.sha = fileSha;
    }
    
    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestData)
    });
    
    if (response.ok) {
        const result = await response.json();
        return result;
    } else {
        const error = await response.json();
        let errorMessage = `GitHub API error: ${response.status}`;
        
        if (response.status === 403) {
            errorMessage += '\n\n❌ Permission denied. Please check:\n';
            errorMessage += '1. Your token has the "repo" scope (for private repos) or "public_repo" scope (for public repos)\n';
            errorMessage += '2. The repository exists and you have access to it\n';
            errorMessage += '3. The token is not expired\n';
            errorMessage += `\nError details: ${JSON.stringify(error)}`;
        } else {
            errorMessage += ` - ${JSON.stringify(error)}`;
        }
        
        throw new Error(errorMessage);
    }
}

async function handleFetchSubmissionCode(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch submission: ${response.status}`);
        }
        
        const html = await response.text();
        
        // Parse the HTML to extract code
        // Codeforces stores the code in a specific element with id="program-source-text"
        // Try multiple patterns to find the code
        let codeMatch = html.match(/<pre[^>]*id="program-source-text"[^>]*>([\s\S]*?)<\/pre>/i);
        
        if (!codeMatch) {
            codeMatch = html.match(/<pre[^>]*class="[^"]*program-source-text[^"]*"[^>]*>([\s\S]*?)<\/pre>/i);
        }
        
        if (!codeMatch) {
            codeMatch = html.match(/<code[^>]*id="program-source-text"[^>]*>([\s\S]*?)<\/code>/i);
        }
        
        if (!codeMatch) {
            // Try to find any pre/code tag that might contain the source
            codeMatch = html.match(/<pre[^>]*>([\s\S]{100,})<\/pre>/i);
        }
        
        if (codeMatch && codeMatch[1]) {
            // Decode HTML entities and clean up
            let code = codeMatch[1]
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&amp;/g, '&')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&#x27;/g, "'")
                .replace(/&#x2F;/g, '/')
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<[^>]+>/g, '') // Remove any remaining HTML tags
                .trim();
            
            // Additional cleanup
            code = code.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            
            return code;
        }
        
        throw new Error('Could not find code in submission page');
    } catch (error) {
        console.error('Error fetching submission code:', error);
        throw error;
    }
}

// SHA-512 hash function using Web Crypto API
async function sha512hex(message) {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-512', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// Handle fetch submissions request (works from any page)
async function handleFetchSubmissions(count, fetchMax, tabId) {
    // Get credentials from storage
    const result = await chrome.storage.sync.get(['codeforcesHandle', 'apiKey', 'apiSecret']);
    
    if (!result.codeforcesHandle || !result.apiKey || !result.apiSecret) {
        throw new Error('Please configure your Codeforces credentials in the extension popup');
    }
    
    const handle = result.codeforcesHandle;
    const apiKey = result.apiKey;
    const apiSecret = result.apiSecret;
    
    // Determine count - if max, use a large number (Codeforces API limit is typically 10000)
    const apiCount = fetchMax ? 10000 : (count || 10);
    
    // Generate API signature
    const rand = Math.floor(Math.random() * 900000) + 100000;
    const time = Math.floor(Date.now() / 1000);
    const apiSigString = rand + '/user.status?apiKey=' + apiKey + '&count=' + apiCount + '&from=1&handle=' + handle + '&includeSources=true&time=' + time + '#' + apiSecret;
    const hash = await sha512hex(apiSigString);
    const url = 'https://codeforces.com/api/user.status?handle=' + handle + '&from=1&count=' + apiCount + '&includeSources=true&apiKey=' + apiKey + '&time=' + time + '&apiSig=' + rand + hash;
    
    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status !== 'OK') {
        throw new Error(`Codeforces API error: ${data.comment || 'Unknown error'}`);
    }
    
    const submissions = data.result;
    if (submissions.length === 0) {
        return { count: 0 };
    }
    
    // Filter for accepted submissions only
    const acceptedSubmissions = submissions.filter(sub => 
        sub.verdict === 'OK' || sub.verdict === 'ACCEPTED'
    );
    
    if (acceptedSubmissions.length === 0) {
        return { count: 0 };
    }
    
    // Inject content script to show modal (works on any page)
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
        });
        
        // Wait a bit for script to load, then send message
        await new Promise(resolve => setTimeout(resolve, 500));
        
        chrome.tabs.sendMessage(tabId, {
            action: 'showSolutionModal',
            submissions: acceptedSubmissions
        });
    } catch (error) {
        // If injection fails, try sending message anyway (script might already be loaded)
        chrome.tabs.sendMessage(tabId, {
            action: 'showSolutionModal',
            submissions: acceptedSubmissions
        }).catch(() => {
            throw new Error('Could not inject content script. Please refresh the page and try again.');
        });
    }
    
    return { count: acceptedSubmissions.length };
}
