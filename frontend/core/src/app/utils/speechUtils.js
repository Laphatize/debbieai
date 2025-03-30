// Observer to watch for new AI messages and read them aloud
export function setupSpeechObserver() {
  if (typeof window === 'undefined') return;
  
  console.log('Setting up speech observer');
  
  // Create a mutation observer to watch for new messages
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // Look for AI message containers that were just added
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Try different selectors to find AI messages
            const aiMessages = node.classList?.contains('ai-message') 
              ? [node] 
              : Array.from(node.querySelectorAll('.ai-message, [data-role="assistant"], [role="assistant"]'));
            
            if (aiMessages.length > 0) {
              // Get the text content of the last AI message
              const lastMessage = aiMessages[aiMessages.length - 1];
              const messageText = lastMessage.textContent;
              
              console.log('Found AI message to speak:', messageText);
              
              // Speak the message
              if (window.speakText && messageText) {
                window.speakText(messageText);
              }
            } else {
              // Try to find messages by their structure
              const possibleMessages = Array.from(
                node.querySelectorAll('div > div > div > p, .message-content, .message')
              );
              
              if (possibleMessages.length > 0) {
                const lastPossibleMessage = possibleMessages[possibleMessages.length - 1];
                // Check if this is likely an AI message (not from the user)
                const isUserMessage = lastPossibleMessage.closest('[data-role="user"], [role="user"]');
                
                if (!isUserMessage) {
                  const messageText = lastPossibleMessage.textContent;
                  console.log('Found possible AI message to speak:', messageText);
                  
                  if (window.speakText && messageText) {
                    window.speakText(messageText);
                  }
                }
              }
            }
          }
        });
      }
    });
  });

  // Start observing the entire document body for changes
  observer.observe(document.body, { childList: true, subtree: true });
  
  // Also try to find specific chat containers
  const chatContainers = [
    document.querySelector('.chat-container'),
    document.querySelector('.messages-container'),
    document.querySelector('.conversation'),
    // Add more potential selectors
  ].filter(Boolean);
  
  if (chatContainers.length > 0) {
    console.log('Found chat containers:', chatContainers.length);
    chatContainers.forEach(container => {
      observer.observe(container, { childList: true, subtree: true });
    });
  }

  return observer;
} 