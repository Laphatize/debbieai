export default function Modal({ isOpen, onClose, title, children }) {
  if (!isOpen) return null;

  // Function to handle speech recognition
  const startSpeechRecognition = () => {
    if (!('webkitSpeechRecognition' in window)) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    // If we have a global speech recognition toggle function, use it
    if (window.toggleSpeechRecognition) {
      window.toggleSpeechRecognition();
      return;
    }

    // Fallback implementation if the global function isn't available
    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    // Add silence timeout
    let silenceTimer = null;
    const SILENCE_TIMEOUT = 5000; // 5 seconds
    
    const resetSilenceTimer = (transcript) => {
      if (silenceTimer) clearTimeout(silenceTimer);
      
      silenceTimer = setTimeout(() => {
        console.log('Silence detected, sending message...');
        
        // Find the input field and set its final value
        const inputField = document.querySelector('input[type="text"][placeholder="Type your message..."]');
        if (inputField && transcript) {
          // Set the value and trigger change event to update React state
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
          ).set;
          nativeInputValueSetter.call(inputField, transcript);
          
          const event = new Event('input', { bubbles: true });
          inputField.dispatchEvent(event);
          
          // Find and click the send button
          const sendButton = document.querySelector('button:contains("Send")') || 
                            document.querySelector('button[onClick*="sendMessage"]') ||
                            inputField.closest('div').querySelector('button');
          
          if (sendButton) {
            console.log('Clicking send button after silence');
            sendButton.click();
          }
        }
        
        // Stop recognition
        recognition.stop();
      }, SILENCE_TIMEOUT);
    };

    recognition.onstart = () => {
      console.log('Speech recognition started');
      // Add visual indicator that we're listening
      document.body.classList.add('listening');
    };

    let currentTranscript = '';
    
    recognition.onresult = (event) => {
      const current = event.resultIndex;
      const transcript = event.results[current][0].transcript;
      currentTranscript = transcript;
      
      // Find the input field and set its value
      const inputField = document.querySelector('input[type="text"][placeholder="Type your message..."]');
      if (inputField) {
        inputField.value = transcript;
        
        // Reset the silence timer whenever we get a result
        resetSilenceTimer(transcript);
        
        // If this is a final result, submit the form
        if (event.results[current].isFinal) {
          console.log('Final transcript:', transcript);
          
          // Set the value and trigger change event to update React state
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
          ).set;
          nativeInputValueSetter.call(inputField, transcript);
          
          const event = new Event('input', { bubbles: true });
          inputField.dispatchEvent(event);
          
          // Find and click the send button
          const sendButton = document.querySelector('button:contains("Send")') || 
                            document.querySelector('button[onClick*="sendMessage"]') ||
                            inputField.closest('div').querySelector('button');
          
          if (sendButton) {
            console.log('Clicking send button');
            sendButton.click();
          } else {
            console.error('Could not find send button');
          }
          
          // Clear the silence timer
          if (silenceTimer) {
            clearTimeout(silenceTimer);
            silenceTimer = null;
          }
          
          recognition.stop();
        }
      } else {
        console.error('Could not find input field');
      }
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error', event.error);
      document.body.classList.remove('listening');
      
      // Clear the silence timer
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
    };

    recognition.onend = () => {
      console.log('Speech recognition ended');
      document.body.classList.remove('listening');
      
      // Clear the silence timer
      if (silenceTimer) {
        clearTimeout(silenceTimer);
        silenceTimer = null;
      }
      
      // If we have a transcript but didn't send it yet, send it now
      if (currentTranscript) {
        const inputField = document.querySelector('input[type="text"][placeholder="Type your message..."]');
        if (inputField) {
          // Set the value and trigger change event to update React state
          const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
          ).set;
          nativeInputValueSetter.call(inputField, currentTranscript);
          
          const event = new Event('input', { bubbles: true });
          inputField.dispatchEvent(event);
          
          // Find and click the send button
          const sendButton = document.querySelector('button:contains("Send")') || 
                            document.querySelector('button[onClick*="sendMessage"]') ||
                            inputField.closest('div').querySelector('button');
          
          if (sendButton) {
            console.log('Clicking send button on end');
            sendButton.click();
          }
        }
      }
    };

    recognition.start();
    
    // Start the silence timer immediately
    resetSilenceTimer('');
  };

  // Function to speak text
  const speakText = (text) => {
    if (!('speechSynthesis' in window)) {
      alert('Text-to-speech is not supported in this browser.');
      return;
    }

    // Stop any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  };

  // Function to toggle model provider
  const toggleModelProvider = () => {
    if (window.toggleModelProvider) {
      window.toggleModelProvider();
    }
  };

  // Expose functions to window for global access
  if (typeof window !== 'undefined') {
    window.startSpeechRecognition = startSpeechRecognition;
    window.speakText = speakText;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 rounded-lg w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800">
          <h2 className="text-lg font-medium text-neutral-900 dark:text-white">{title}</h2>
          <div className="flex items-center">
            <button
              onClick={toggleModelProvider}
              className="text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 mr-2"
              title="Toggle AI model"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </button>
            <button
              onClick={startSpeechRecognition}
              className="text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 mr-2"
              title="Start voice input"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
} 