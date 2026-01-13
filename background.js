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
    
    let url = `https://api.github.com/repos/${username}/${repo}/contents/${filename}`;
    let requestData = {
        message: commitMsg,
        content: code,
        branch: 'main'
    };
    
    if (sha) {
        requestData.sha = sha;
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
        throw new Error(`GitHub API error: ${response.status} - ${JSON.stringify(error)}`);
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
