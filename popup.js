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
        chrome.storage.sync.get(['githubUsername', 'githubRepo', 'githubToken', 'codeforcesHandle'], function(result) {
            if (result.githubUsername && result.githubToken && result.codeforcesHandle) {
                // User is logged in
                showUserInfo(result.githubUsername, result.githubRepo, result.githubToken, result.codeforcesHandle);
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
        
        if (!username || !repo || !token || !handle) {
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
            codeforcesHandle: handle
        }, function() {
            if (chrome.runtime.lastError) {
                showStatus('Error saving credentials: ' + chrome.runtime.lastError.message, 'error');
            } else {
                showStatus('Credentials saved successfully!', 'success');
                showUserInfo(username, repo, token, handle);
            }
        });
    }
    
    function showUserInfo(username, repo, token, handle) {
        document.getElementById('displayUsername').textContent = username;
        document.getElementById('displayRepo').textContent = repo;
        document.getElementById('displayToken').textContent = token.substring(0, 10) + '...';
        document.getElementById('displayHandle').textContent = handle;
        
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
        chrome.storage.sync.get(['githubUsername', 'githubRepo', 'githubToken', 'codeforcesHandle'], function(result) {
            document.getElementById('githubUsername').value = result.githubUsername || '';
            document.getElementById('githubRepo').value = result.githubRepo || '';
            document.getElementById('githubToken').value = result.githubToken || '';
            document.getElementById('codeforcesHandle').value = result.codeforcesHandle || '';
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
