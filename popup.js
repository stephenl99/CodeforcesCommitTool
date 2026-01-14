// Popup script for user account management
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const userInfo = document.getElementById('userInfo');
    const status = document.getElementById('status');
    
    // Load saved credentials on popup open
    loadCredentials();
    
    // Save credentials button
    document.getElementById('saveCredentials').addEventListener('click', saveCredentials);
    
    // Edit credentials button
    document.getElementById('editCredentials').addEventListener('click', editCredentials);
    
    // Logout button
    document.getElementById('logout').addEventListener('click', logout);
    
    function loadCredentials() {
        chrome.storage.sync.get(['githubUsername', 'githubRepo', 'githubToken', 'codeforcesHandle', 'apiKey', 'apiSecret'], function(result) {
            if (result.githubUsername && result.githubToken && result.codeforcesHandle && result.apiKey && result.apiSecret) {
                // User is logged in
                showUserInfo(result.githubUsername, result.githubRepo, result.githubToken, result.codeforcesHandle, result.apiKey, result.apiSecret);
            } else {
                // User needs to login
                showLoginForm();
            }
        });
    }
    
    function saveCredentials() {
        const username = document.getElementById('githubUsername').value.trim();
        const repo = document.getElementById('githubRepo').value.trim();
        const token = document.getElementById('githubToken').value.trim();
        const handle = document.getElementById('codeforcesHandle').value.trim();
        const apiKey = document.getElementById('apiKey').value.trim();
        const apiSecret = document.getElementById('apiSecret').value.trim();
        
        if (!username || !repo || !token || !handle || !apiKey || !apiSecret) {
            showStatus('Please fill in all fields', 'error');
            return;
        }
        
        // Validate GitHub token format
        if (!token.startsWith('ghp_') && !token.startsWith('github_pat_')) {
            showStatus('Invalid GitHub token format. Token should start with "ghp_" or "github_pat_"', 'error');
            return;
        }
        
        // Save to Chrome storage
        chrome.storage.sync.set({
            githubUsername: username,
            githubRepo: repo,
            githubToken: token,
            codeforcesHandle: handle,
            apiKey: apiKey,
            apiSecret: apiSecret
        }, function() {
            if (chrome.runtime.lastError) {
                showStatus('Error saving credentials: ' + chrome.runtime.lastError.message, 'error');
            } else {
                showStatus('Credentials saved successfully!', 'success');
                showUserInfo(username, repo, token, handle, apiKey, apiSecret);
            }
        });
    }
    
    function showUserInfo(username, repo, token, handle, apiKey, apiSecret) {
        document.getElementById('displayUsername').textContent = username;
        document.getElementById('displayRepo').textContent = repo;
        document.getElementById('displayToken').textContent = token.substring(0, 10) + '...';
        document.getElementById('displayHandle').textContent = handle;
        document.getElementById('displayApiKey').textContent = apiKey.substring(0, 10) + '...';
        document.getElementById('displayApiSecret').textContent = apiSecret.substring(0, 10) + '...';
        
        loginForm.style.display = 'none';
        userInfo.style.display = 'block';
    }
    
    function showLoginForm() {
        loginForm.style.display = 'block';
        userInfo.style.display = 'none';
    }
    
    function editCredentials() {
        showLoginForm();
        // Pre-fill the form with current values
        chrome.storage.sync.get(['githubUsername', 'githubRepo', 'githubToken', 'codeforcesHandle', 'apiKey', 'apiSecret'], function(result) {
            document.getElementById('githubUsername').value = result.githubUsername || '';
            document.getElementById('githubRepo').value = result.githubRepo || '';
            document.getElementById('githubToken').value = result.githubToken || '';
            document.getElementById('codeforcesHandle').value = result.codeforcesHandle || '';
            document.getElementById('apiKey').value = result.apiKey || '';
            document.getElementById('apiSecret').value = result.apiSecret || '';
        });
    }
    
    function logout() {
        chrome.storage.sync.clear(function() {
            showStatus('Logged out successfully', 'success');
            showLoginForm();
            // Clear the form
            document.getElementById('githubUsername').value = '';
            document.getElementById('githubRepo').value = '';
            document.getElementById('githubToken').value = '';
            document.getElementById('codeforcesHandle').value = '';
            document.getElementById('apiKey').value = '';
            document.getElementById('apiSecret').value = '';
        });
    }
    
    function showStatus(message, type) {
        status.textContent = message;
        status.className = 'status ' + type;
        status.style.display = 'block';
        
        // Hide status after 3 seconds
        setTimeout(function() {
            status.style.display = 'none';
        }, 3000);
    }
});
