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
    

    // Setup fetch submissions handlers (button is in userInfo div which may be hidden)
    function setupFetchSubmissionsHandlers() {
        const fetchSubmissionsBtn = document.getElementById('fetchSubmissions');
        
        if (fetchSubmissionsBtn && !fetchSubmissionsBtn.hasAttribute('data-listener-attached')) {
            fetchSubmissionsBtn.addEventListener('click', function(e) {
                fetchSubmissions();
            });
            fetchSubmissionsBtn.setAttribute('data-listener-attached', 'true');
        }
        
        const fetchMaxCheckbox = document.getElementById('fetchMax');
        if (fetchMaxCheckbox && !fetchMaxCheckbox.hasAttribute('data-listener-attached')) {
            fetchMaxCheckbox.addEventListener('change', function() {
                const countInput = document.getElementById('submissionCount');
                if (countInput) {
                    countInput.disabled = this.checked;
                    if (this.checked) {
                        countInput.value = '';
                    } else {
                        countInput.value = '10';
                    }
                }
            });
            fetchMaxCheckbox.setAttribute('data-listener-attached', 'true');
        }
    }
    
    // Try to setup handlers immediately (in case userInfo is already visible)
    setupFetchSubmissionsHandlers();
    
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
        
        // Setup fetch submissions handlers now that userInfo is visible
        setupFetchSubmissionsHandlers();
        
        // Setup fetch submissions handlers now that userInfo is visible
        setupFetchSubmissionsHandlers();
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
    
    function fetchSubmissions() {
        const fetchMaxCheckbox = document.getElementById('fetchMax');
        const countInput = document.getElementById('submissionCount');
        const fetchStatus = document.getElementById('fetchStatus');
        
        if (!fetchMaxCheckbox || !countInput || !fetchStatus) {
            return;
        }
        
        const fetchMax = fetchMaxCheckbox.checked;
        let count = null;
        
        if (!fetchMax) {
            count = parseInt(countInput.value, 10);
            if (isNaN(count) || count < 1) {
                fetchStatus.textContent = 'Please enter a valid number of submissions';
                fetchStatus.className = 'status error';
                fetchStatus.style.display = 'block';
                setTimeout(() => {
                    fetchStatus.style.display = 'none';
                }, 3000);
                return;
            }
        }
        
        // Get active tab (works from any page)
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            if (tabs.length === 0) {
                fetchStatus.textContent = 'Could not find active tab';
                fetchStatus.className = 'status error';
                fetchStatus.style.display = 'block';
                return;
            }
            
            const currentTab = tabs[0];
            
            // Fetch submissions via background script (works from any page)
            fetchStatus.textContent = 'Fetching submissions...';
            fetchStatus.className = 'status';
            fetchStatus.style.display = 'block';
            
            chrome.runtime.sendMessage({
                action: 'fetchSubmissions',
                count: count,
                max: fetchMax,
                tabId: currentTab.id
            }, function(response) {
                if (chrome.runtime.lastError) {
                    fetchStatus.textContent = 'Error: ' + chrome.runtime.lastError.message;
                    fetchStatus.className = 'status error';
                } else if (response && response.success) {
                    fetchStatus.textContent = `✅ Fetched ${response.count || 'all'} submissions`;
                    fetchStatus.className = 'status success';
                    setTimeout(() => {
                        fetchStatus.style.display = 'none';
                    }, 3000);
                } else {
                    fetchStatus.textContent = response?.error || 'Failed to fetch submissions';
                    fetchStatus.className = 'status error';
                    setTimeout(() => {
                        fetchStatus.style.display = 'none';
                    }, 3000);
                }
            });
        });
    }
});
