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
