'use client';
import Image from "next/image";
import { useState, useRef, useEffect, useCallback } from "react";
import Editor from "@monaco-editor/react";
import Modal from "./components/Modal";
import WebSocket from 'ws';
import DebugPanel from './components/DebugPanel';
import { setupSpeechObserver } from './utils/speechUtils';

export default function Home() {
  const [activeView, setActiveView] = useState('preview');
  const [generatedCode, setGeneratedCode] = useState('// Your AI generated code will appear here');
  const [activeModal, setActiveModal] = useState(null);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [terminalHeight, setTerminalHeight] = useState(200); // Default terminal height
  const resizeRef = useRef(null);
  const isDraggingRef = useRef(false);
  const [attachments, setAttachments] = useState([]);
  const fileInputRef = useRef(null);
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Hello! How can I help you today?'
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [openFiles, setOpenFiles] = useState([
    { id: 1, name: 'index.js', language: 'javascript', content: '// Your code here' },
    { id: 2, name: 'styles.css', language: 'css', content: '/* Your styles here */' },
  ]);
  const [activeFileId, setActiveFileId] = useState(1);
  const [isVoiceMode, setVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef(null);
  const synthesisRef = useRef(null);
  const [terminal, setTerminal] = useState(null);
  const [terminalOutput, setTerminalOutput] = useState('');
  const [projectId, setProjectId] = useState(null);
  const wsRef = useRef(null);
  const [backendStatus, setBackendStatus] = useState('checking');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const iframeRef = useRef(null);
  const [fileHistory, setFileHistory] = useState(new Map());
  const [modelProvider, setModelProvider] = useState('openai'); // Default to OpenAI
  const [cloudflareUrl, setCloudflareUrl] = useState(null);

  // Get current file content for editor
  const currentFile = openFiles.find(f => f.id === activeFileId) || openFiles[0];

  const closeModal = () => setActiveModal(null);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!isDraggingRef.current) return;
      
      const container = resizeRef.current.parentElement;
      const containerRect = container.getBoundingClientRect();
      const newHeight = containerRect.bottom - e.clientY;
      
      setTerminalHeight(Math.min(Math.max(100, newHeight), containerRect.height - 100));
    };

    const handleMouseUp = () => {
      isDraggingRef.current = false;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  useEffect(() => {
    // Initialize speech recognition
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const SpeechRecognition = window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.onresult = (event) => {
        const current = event.resultIndex;
        const transcript = event.results[current][0].transcript;
        
        if (event.results[current].isFinal) {
          // Set the input message and then send it using the existing sendMessage function
          setInputMessage(transcript);
          setTranscript('');
          
          // Use setTimeout to ensure state update has completed
          setTimeout(() => {
            sendMessage();
          }, 10);
        } else {
          // Update the temporary transcript
          setTranscript(transcript);
          setIsSpeaking(true);
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  useEffect(() => {
    // Initialize speech synthesis
    if (typeof window !== 'undefined') {
      synthesisRef.current = window.speechSynthesis;
    }
  }, []);

  const speakResponse = (text) => {
    if (!('speechSynthesis' in window)) {
      console.error('Text-to-speech is not supported in this browser.');
      return;
    }

    // Stop any ongoing speech
    window.speechSynthesis.cancel();
    
    setIsSpeaking(true);
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    
    utterance.onend = () => {
      setIsSpeaking(false);
    };
    
    window.speechSynthesis.speak(utterance);
  };

  // Clean up speech synthesis when closing voice mode
  useEffect(() => {
    if (!isVoiceMode && synthesisRef.current) {
      synthesisRef.current.cancel();
    }
  }, [isVoiceMode]);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setAttachments(prev => [...prev, ...files]);
  };

  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const connectTerminal = useCallback(async (terminalId) => {
    const ws = new WebSocket(`ws://localhost:3001/terminals/${terminalId}`);
    
    ws.onmessage = (event) => {
      const { type, data } = JSON.parse(event.data);
      if (type === 'terminal') {
        setTerminalOutput(prev => prev + data);
      }
    };

    wsRef.current = ws;
  }, []);

  const createTerminal = useCallback(async () => {
    if (!projectId) return;

    const response = await fetch('http://localhost:3001/api/terminals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId })
    });

    const { terminalId } = await response.json();
    setTerminal(terminalId);
    connectTerminal(terminalId);
  }, [projectId, connectTerminal]);

  const updateFiles = (newFiles) => {
    setOpenFiles(prevFiles => {
      const updatedFiles = [...prevFiles];
      
      newFiles.forEach(newFile => {
        const existingFileIndex = updatedFiles.findIndex(f => f.name.toLowerCase() === newFile.name.toLowerCase());
        
        // Store current content in history before updating
        if (existingFileIndex >= 0) {
          const currentContent = updatedFiles[existingFileIndex].content;
          setFileHistory(prev => new Map(prev).set(newFile.name, currentContent));
        }

        const fileToAdd = {
          id: existingFileIndex >= 0 ? updatedFiles[existingFileIndex].id : Date.now() + Math.random(),
          name: newFile.name,
          language: newFile.language,
          content: newFile.content
        };

        if (existingFileIndex >= 0) {
          updatedFiles[existingFileIndex] = fileToAdd;
        } else {
          updatedFiles.push(fileToAdd);
        }
      });

      return updatedFiles;
    });
  };

  const handleUndo = (fileName) => {
    if (fileHistory.has(fileName)) {
      setOpenFiles(prevFiles => {
        return prevFiles.map(file => {
          if (file.name.toLowerCase() === fileName.toLowerCase()) {
            return {
              ...file,
              content: fileHistory.get(fileName)
            };
          }
          return file;
        });
      });
      // Remove from history after undoing
      setFileHistory(prev => {
        const newHistory = new Map(prev);
        newHistory.delete(fileName);
        return newHistory;
      });
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim()) return;

    // Add message to chat
    const newMessages = [
      ...messages,
      { role: 'user', content: inputMessage }
    ];
    setMessages(newMessages);
    setInputMessage('');
    setIsAiThinking(true);

    try {
      // Check backend
      try {
        await fetch('http://localhost:3001/health');
      } catch (error) {
        throw new Error('Backend server is not running. Please start the backend server first.');
      }

      // Get current project state
      const currentState = {
        files: openFiles.map(f => ({
          name: f.name,
          content: f.content,
          language: f.language
        })),
        activeFile: currentFile?.name,
        // Include last 5 messages for context
        messageHistory: messages.slice(-5),
        // Flag if this is a follow-up request
        isFollowUp: messages.length > 1
      };

      // Send to backend
      const response = await fetch('http://localhost:3001/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: inputMessage,
          context: currentState,
          modelProvider: modelProvider // Include the selected model provider
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get AI response');
      }

      const data = await response.json();
      
      // Extract files and explanation
      const { files, explanation } = data;
      
      // Update files in editor
      updateFiles(files);

      // Add message with deployment instructions
      const aiResponse = `${explanation}\n\nFiles have been updated. Click the "Deploy" button to deploy your application.`;
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: aiResponse
      }]);

      // Speak the response if in voice mode
      if (isVoiceMode || isListening) {
        speakResponse(aiResponse);
      }

    } catch (error) {
      console.error('AI Error:', error);
      const errorMessage = `Error: ${error.message}`;
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: errorMessage
      }]);
      
      // Speak the error message if in voice mode
      if (isVoiceMode || isListening) {
        speakResponse(errorMessage);
      }
    } finally {
      setIsAiThinking(false);
      setIsSpeaking(false);
    }
  };

  // Helper function to merge file contents
  const mergeContents = (oldContent, newContent) => {
    // Simple merge strategy - could be made more sophisticated
    if (oldContent.trim() === '') return newContent;
    if (newContent.includes(oldContent)) return newContent;
    return `${oldContent}\n\n// New changes:\n${newContent}`;
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    } else {
      if (recognitionRef.current) {
        recognitionRef.current.start();
      }
    }
  };

  const saveAndRunProject = async () => {
    try {
      // Save project
      const response = await fetch('http://localhost:3001/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectName,
          description: projectDescription,
          files: openFiles
        })
      });

      const { projectId } = await response.json();
      setProjectId(projectId);

      // Create terminal
      await createTerminal();

      // Run the project
      const runResponse = await fetch('http://localhost:3001/api/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          command: 'npm install && npm start'
        })
      });

      const { output } = await runResponse.json();
      setTerminalOutput(output);
    } catch (error) {
      console.error('Error saving and running project:', error);
    }
  };

  // Add a function to refresh the preview
  const refreshPreview = useCallback(() => {
    if (iframeRef.current) {
      try {
        iframeRef.current.contentWindow.location.reload();
      } catch (err) {
        iframeRef.current.src = iframeRef.current.src;
      }
    }
  }, []);

  // Update the connectToWebSocket function to handle browser environment
  const connectToWebSocket = (projectId) => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    
    // Skip WebSocket connection if we're in the browser and the backend doesn't support it
    if (typeof window === 'undefined') {
      return;
    }
    
    try {
      // Use the browser's native WebSocket
      const wsUrl = `ws://localhost:3001/ws/${projectId}`;
      console.log(`Attempting to connect to WebSocket at ${wsUrl}`);
      
      // Check if WebSocket is supported
      if (!window.WebSocket) {
        console.log('WebSocket not supported in this browser');
        return;
      }
      
      const ws = new window.WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('WebSocket connection established');
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'log') {
            setTerminalOutput(prev => prev + '\n' + data.message);
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };
      
      ws.onerror = (error) => {
        console.log('WebSocket error - this is normal if the backend doesn\'t support WebSockets');
      };
      
      ws.onclose = () => {
        console.log('WebSocket connection closed');
      };
      
      wsRef.current = ws;
    } catch (error) {
      console.log('WebSocket connection failed - this is expected if the backend doesn\'t support it');
    }
  };

  // Update the deployProject function to make WebSocket optional
  const deployProject = async () => {
    if (isDeploying) return;
    
    setIsDeploying(true);
    setPreviewUrl(null);
    setCloudflareUrl(null);
    
    try {
      // Check backend
      try {
        await fetch('http://localhost:3001/health');
      } catch (error) {
        throw new Error('Backend server is not running. Please start the backend server first.');
      }
      
      // Get current files
      const filesToDeploy = openFiles.map(f => ({
        name: f.name,
        content: f.content,
        language: f.language
      }));
      
      // Send to backend
      const response = await fetch('http://localhost:3001/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: filesToDeploy
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to deploy project');
      }
      
      const data = await response.json();
      console.log('Deployment successful:', data);
      
      // Set project ID and preview URL
      setProjectId(data.projectId);
      setPreviewUrl(data.url);
      
      // Set Cloudflare URL if available
      if (data.cloudflareUrl) {
        setCloudflareUrl(data.cloudflareUrl);
        
        // Add a message about the Cloudflare URL
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Your project is now deployed! 🚀\n\nLocal URL: ${data.url}\nPublic URL: ${data.cloudflareUrl}\n\nYou can share the public URL with anyone, and they can access your project from anywhere.`
        }]);
      } else {
        // Add a message about the local URL
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `Your project is deployed locally at: ${data.url}`
        }]);
      }
      
      // Connect to WebSocket for logs (only if the backend supports it)
      try {
        // Make this optional - don't let it break deployment if it fails
        if (typeof window !== 'undefined' && window.WebSocket) {
          connectToWebSocket(data.projectId);
        }
      } catch (wsError) {
        // Just log and continue - don't let WebSocket issues break deployment
        console.log('WebSocket connection not available (this is normal)');
      }
      
      // Add this to the deployProject function, after the deployment is successful
      if (!data.cloudflareUrl) {
        // If no Cloudflare URL was returned, set up a check to poll for it
        const checkInterval = setInterval(() => {
          checkForCloudflareUrl(data.projectId);
        }, 5000); // Check every 5 seconds
        
        // Stop checking after 30 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
        }, 30000);
      }
      
    } catch (error) {
      console.error('Deployment error:', error);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Deployment failed: ${error.message}`
      }]);
    } finally {
      setIsDeploying(false);
    }
  };

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await fetch('http://localhost:3001/health');
        if (response.ok) {
          setBackendStatus('connected');
        } else {
          setBackendStatus('error');
        }
      } catch {
        setBackendStatus('disconnected');
      }
    };

    checkBackend();
    const interval = setInterval(checkBackend, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Setup speech observer
    const observer = setupSpeechObserver();
    
    // Cleanup function
    return () => {
      if (observer) {
        observer.disconnect();
      }
    };
  }, []);

  // Add this function to toggle between model providers
  const toggleModelProvider = () => {
    setModelProvider(prev => prev === 'openai' ? 'gemini' : 'openai');
  };

  // Update the useEffect that exposes global functions
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.toggleSpeechRecognition = toggleListening;
      window.speakText = speakResponse;
      window.toggleModelProvider = toggleModelProvider;
    }
    
    return () => {
      if (typeof window !== 'undefined') {
        delete window.toggleSpeechRecognition;
        delete window.speakText;
        delete window.toggleModelProvider;
      }
    };
  }, [toggleListening, toggleModelProvider]);

  // Add this function to your component, before the return statement
  const formatMessageWithLinks = (text) => {
    // Regex to match URLs, with special handling for localhost URLs and Cloudflare URLs
    const urlRegex = /(https?:\/\/(?:localhost:[0-9]+|[^\s]+\.trycloudflare\.com|[^\s]+))/g;
    
    // Split the text by URLs
    const parts = text.split(urlRegex);
    
    // Map each part - if it matches the regex, make it a link
    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        return (
          <a 
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline"
          >
            {part}
          </a>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  // Add this function to check for Cloudflare URL if it wasn't available initially
  const checkForCloudflareUrl = async (projectId) => {
    if (cloudflareUrl) return; // Already have a URL
    
    try {
      // Try to get the Cloudflare URL from the backend
      const response = await fetch(`http://localhost:3001/api/projects/${projectId}/status`);
      if (response.ok) {
        const data = await response.json();
        if (data.cloudflareUrl && data.cloudflareUrl !== cloudflareUrl) {
          setCloudflareUrl(data.cloudflareUrl);
          
          // Add a message about the Cloudflare URL
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `Your project is now available at a public URL! 🚀\n\nPublic URL: ${data.cloudflareUrl}\n\nYou can share this URL with anyone, and they can access your project from anywhere.`
          }]);
        }
      }
    } catch (error) {
      console.error('Error checking for Cloudflare URL:', error);
    }
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Navigation Bar */}
      <nav className="bg-white dark:bg-black border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex items-center justify-between px-6 py-3">
          {/* Left side - Brand */}
          <div className="flex items-center gap-2">
            <div className="relative w-10 h-10">
              {/* Outer glow */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-400/30 to-purple-500/30 blur-xl animate-pulse"></div>
              {/* Middle glow */}
              <div className="absolute inset-1 rounded-full bg-gradient-to-br from-blue-400/40 to-purple-500/40 blur-md"></div>
              {/* Core orb */}
              <div className="absolute inset-2 rounded-full bg-gradient-to-br from-blue-400/80 via-blue-400/50 to-purple-500/80 backdrop-blur-sm shadow-lg"></div>
              {/* Inner glow */}
              <div className="absolute inset-2 rounded-full bg-gradient-to-tl from-white/10 to-transparent"></div>
              {/* Shine effect */}
              <div className="absolute inset-[30%] top-[10%] rounded-full bg-white/30 blur-sm"></div>
            </div>
            <span className="font-['Instrument_Serif'] text-2xl text-neutral-900 dark:text-white">
              DebbieAI
            </span>
          </div>

          {/* Center - Project Actions */}
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setActiveModal('new')}
              className="flex items-center gap-2 px-3 py-1.5 text-sm border border-neutral-200 dark:border-neutral-800 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-900 text-neutral-900 dark:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              New Project
            </button>
            <button 
              onClick={() => setActiveModal('open')}
              className="flex items-center gap-2 px-3 py-1.5 text-sm border border-neutral-200 dark:border-neutral-800 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-900 text-neutral-900 dark:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
              </svg>
              Open
            </button>
            <button 
              onClick={() => setActiveModal('save')}
              className="flex items-center gap-2 px-3 py-1.5 text-sm border border-neutral-200 dark:border-neutral-800 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-900 text-neutral-900 dark:text-white transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              Save
            </button>
            <button
              onClick={deployProject}
              disabled={isDeploying || !openFiles.length}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isDeploying || !openFiles.length
                  ? 'bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'
                  : 'bg-green-500 text-white hover:bg-green-600'
              }`}
            >
              {isDeploying ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                  Deploying...
                </div>
              ) : (
                'Deploy'
              )}
            </button>
          </div>

          {/* Right side - Backend Status */}
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${
              backendStatus === 'connected' ? 'bg-green-500' :
              backendStatus === 'checking' ? 'bg-yellow-500' :
              'bg-red-500'
            }`} />
            <span className="text-sm text-neutral-500">
              {backendStatus === 'connected' ? 'Backend Connected' :
               backendStatus === 'checking' ? 'Checking Backend...' :
               'Backend Disconnected'}
            </span>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex flex-1 h-full overflow-hidden">
      {/* Left side - AI Chat */}
        <div className="w-1/2 flex flex-col p-6 border-r border-neutral-200 dark:border-neutral-800 relative">
          <div className={`flex-1 overflow-auto relative rounded-xl ${
            isAiThinking ? 'bg-white dark:bg-black shadow-[0_0_30px_10px_rgba(147,51,234,0.2)] dark:shadow-[0_0_30px_10px_rgba(147,51,234,0.3)]' : ''
          }`}>
          <div className="space-y-4">
              {messages.map((message, index) => (
                <div key={index} className={`flex items-start gap-3 ${
                  message.role === 'user' ? 'flex-row-reverse' : ''
                }`}>
                  {message.role === 'assistant' ? (
                    // Assistant avatar (glowing orb)
                    <div className="relative w-8 h-8">
                      {/* Outer glow */}
                      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-400/30 to-purple-500/30 blur-xl animate-pulse"></div>
                      {/* Middle glow */}
                      <div className="absolute inset-1 rounded-full bg-gradient-to-br from-blue-400/40 to-purple-500/40 blur-md"></div>
                      {/* Core orb */}
                      <div className="absolute inset-2 rounded-full bg-gradient-to-br from-blue-400/80 via-blue-400/50 to-purple-500/80 backdrop-blur-sm shadow-lg"></div>
                      {/* Inner glow */}
                      <div className="absolute inset-2 rounded-full bg-gradient-to-tl from-white/10 to-transparent"></div>
                      {/* Shine effect */}
                      <div className="absolute inset-[30%] top-[10%] rounded-full bg-white/30 blur-sm"></div>
                    </div>
                  ) : (
                    // User avatar
                    <div className="w-8 h-8 rounded-full bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center">
                      <svg className="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                  )}
                  <div className={`rounded-lg p-4 max-w-[80%] ${
                    message.role === 'assistant' 
                      ? 'bg-neutral-100 dark:bg-neutral-900' 
                      : 'bg-neutral-900 dark:bg-white text-white dark:text-black'
                  }`}>
                    {formatMessageWithLinks(message.content)}
                  </div>
                </div>
              ))}
              {isAiThinking && (
            <div className="flex items-start gap-3">
                  <div className="relative w-8 h-8">
                    {/* Outer glow - pulsing stronger */}
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-400/30 to-purple-500/30 blur-xl animate-pulse"></div>
                    {/* Middle glow - pulsing */}
                    <div className="absolute inset-1 rounded-full bg-gradient-to-br from-blue-400/40 to-purple-500/40 blur-md animate-pulse"></div>
                    {/* Core orb - pulsing */}
                    <div className="absolute inset-2 rounded-full bg-gradient-to-br from-blue-400/80 via-blue-400/50 to-purple-500/80 backdrop-blur-sm shadow-lg animate-pulse"></div>
                    {/* Inner glow */}
                    <div className="absolute inset-2 rounded-full bg-gradient-to-tl from-white/10 to-transparent"></div>
                    {/* Shine effect */}
                    <div className="absolute inset-[30%] top-[10%] rounded-full bg-white/30 blur-sm"></div>
                  </div>
                  <div className="bg-neutral-100 dark:bg-neutral-900 rounded-lg p-4 max-w-[80%] animate-pulse">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 rounded-full bg-neutral-300 dark:bg-neutral-700 animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-2 h-2 rounded-full bg-neutral-300 dark:bg-neutral-700 animate-bounce" style={{ animationDelay: '200ms' }}></div>
                      <div className="w-2 h-2 rounded-full bg-neutral-300 dark:bg-neutral-700 animate-bounce" style={{ animationDelay: '400ms' }}></div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          {/* Chat input */}
          <div className="mt-4 border-t border-neutral-200 dark:border-neutral-800 pt-4">
            {/* File Attachments */}
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {attachments.map((file, index) => (
                  <div 
                    key={index}
                    className="flex items-center gap-2 bg-neutral-100 dark:bg-neutral-900 px-3 py-1.5 rounded-lg text-sm"
                  >
                    <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                    <span className="text-neutral-700 dark:text-neutral-300 max-w-[150px] truncate">
                      {file.name}
                    </span>
                    <button 
                      onClick={() => removeAttachment(index)}
                      className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add model selector here, before the input */}
            <div className="flex items-center mb-2">
              <label className="text-sm text-neutral-500 dark:text-neutral-400 mr-2">AI Model:</label>
              <div className="relative">
                <select
                  value={modelProvider}
                  onChange={(e) => setModelProvider(e.target.value)}
                  className="text-sm bg-white dark:bg-black border border-neutral-200 dark:border-neutral-800 rounded pl-2 pr-8 py-1 appearance-none"
                >
                  <option value="openai">GPT-4o</option>
                  <option value="gemini">Gemini</option>
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                  <div className={`w-2 h-2 rounded-full ${modelProvider === 'openai' ? 'bg-blue-500' : 'bg-green-500'}`}></div>
                </div>
              </div>
              {/* Show model info tooltip */}
              <div className="ml-1 group relative">
                <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-48 p-2 bg-neutral-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  {modelProvider === 'openai' ? 
                    'OpenAI GPT-4o: Advanced model with strong coding abilities' : 
                    'Google Gemini: Alternative AI model from Google'}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <div className="flex-1 flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-2 border border-neutral-200 dark:border-neutral-800 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
                >
                  <svg className="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </button>
                {/* Voice mode toggle */}
                <button
                  onClick={() => setVoiceMode(true)}
                  className="px-3 py-2 border border-neutral-200 dark:border-neutral-800 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
                >
                  <svg className="w-5 h-5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                  </svg>
                </button>
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Type your message..."
                  className="flex-1 rounded-lg border border-neutral-200 dark:border-neutral-800 p-2 focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white bg-white dark:bg-black"
                />
              </div>
              <button 
                onClick={sendMessage}
                className="bg-neutral-900 dark:bg-white text-white dark:text-black px-4 py-2 rounded-lg hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors"
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* Right side - Editor/Preview */}
        <div className="w-1/2 flex flex-col">
          {/* Toolbar */}
          <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-neutral-800">
            {/* View toggle buttons */}
            <div className="flex border-b border-neutral-200 dark:border-neutral-800">
              <button 
                onClick={() => setActiveView('preview')}
                className={`flex-1 px-4 py-2 text-sm font-medium ${
                  activeView === 'preview' 
                    ? 'text-neutral-900 dark:text-white border-b-2 border-neutral-900 dark:border-white' 
                    : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                }`}
              >
                Preview
              </button>
              <button 
                onClick={() => setActiveView('code')}
                className={`flex-1 px-4 py-2 text-sm font-medium ${
                  activeView === 'code' 
                    ? 'text-neutral-900 dark:text-white border-b-2 border-neutral-900 dark:border-white' 
                    : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                }`}
              >
                Code
              </button>
            </div>
          </div>

          {/* Editor/Preview Container */}
          <div className="flex-1 min-w-0">
            {activeView === 'preview' ? (
              <div className="w-full h-full bg-white dark:bg-black">
                {previewUrl ? (
                  isPreviewLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="flex flex-col items-center gap-4">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-neutral-900 dark:border-white"></div>
                        <p className="text-neutral-600 dark:text-neutral-400">
                          Loading preview...
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full relative bg-white">
                      <iframe
                        key={previewUrl}
                        src={previewUrl}
                        className="w-full h-full border-0"
                        title="Preview"
                        allow="*"
                        sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                        ref={iframeRef}
                        onLoad={(e) => {
                          if (!e.target.dataset.loaded) {
                            e.target.dataset.loaded = 'true';
                          }
                        }}
                      />
                      <a
                        href={previewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="absolute top-2 right-2 px-3 py-1 bg-neutral-900 text-white rounded-lg text-sm hover:bg-neutral-700 transition-colors"
                      >
                        Open in new tab
                      </a>
                      {fileHistory.size > 0 && (
                        <div className="hidden absolute bottom-2 left-2 bg-yellow-100 dark:bg-yellow-900 p-2 rounded-lg text-sm">
                          <p className="text-yellow-800 dark:text-yellow-200">
                            Files were modified. 
                            <button 
                              onClick={() => handleUndo(Object.keys(fileHistory)[0])}
                              className="ml-2 underline hover:no-underline"
                            >
                              Undo changes
                            </button>
                          </p>
                        </div>
                      )}
                      {cloudflareUrl && (
                        <div className="mt-2 flex items-center">
                          <span className="text-sm text-neutral-500 dark:text-neutral-400 mr-2">Public URL:</span>
                          <a
                            href={cloudflareUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 underline text-sm"
                          >
                            {cloudflareUrl}
                          </a>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(cloudflareUrl);
                              // Optional: Show a "copied" tooltip
                            }}
                            className="ml-2 p-1 rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-300 dark:hover:bg-neutral-700"
                            title="Copy to clipboard"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div className="flex items-center justify-center h-full text-neutral-500">
                    Deploy your project to see a preview
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col">
                {/* File tabs */}
                <div className="flex items-center border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900">
                  <div className="flex-1 flex items-center overflow-x-auto scrollbar-hide">
                    {openFiles.map((file) => (
                      <div
                        key={file.id}
                        onClick={() => setActiveFileId(file.id)}
                        className={`group flex items-center gap-2 px-4 py-2 border-r border-neutral-200 dark:border-neutral-800 min-w-[120px] cursor-pointer ${
                          activeFileId === file.id
                            ? 'bg-white dark:bg-black text-neutral-900 dark:text-white'
                            : 'text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white'
                        }`}
                      >
                        {/* File icon */}
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d={
                              file.language === 'css'
                                ? "M4 20h16a2 2 0 002-2V8a2 2 0 00-2-2h-7.93a2 2 0 01-1.66-.9l-.82-1.2A2 2 0 0012.07 3H4a2 2 0 00-2 2v13c0 1.1.9 2 2 2z"
                                : "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            }
                          />
                        </svg>
                        {/* File name */}
                        <span className="truncate">{file.name}</span>
                        {/* Close button */}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenFiles(prevFiles => {
                              const newFiles = prevFiles.filter(f => f.id !== file.id);
                              if (activeFileId === file.id) {
                                setActiveFileId(newFiles[0]?.id);
                              }
                              return newFiles;
                            });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              setOpenFiles(prevFiles => {
                                const newFiles = prevFiles.filter(f => f.id !== file.id);
                                if (activeFileId === file.id) {
                                  setActiveFileId(newFiles[0]?.id);
                                }
                                return newFiles;
                              });
                            }
                          }}
                          className="ml-2 opacity-0 group-hover:opacity-100 hover:text-red-500 dark:hover:text-red-400 cursor-pointer"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Add new file button */}
                  <button
                    onClick={() => {
                      const newFile = {
                        id: Date.now(),
                        name: `untitled-${openFiles.length + 1}.js`,
                        language: 'javascript',
                        content: ''
                      };
                      setOpenFiles([...openFiles, newFile]);
                      setActiveFileId(newFile.id);
                    }}
                    className="p-2 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white border-l border-neutral-200 dark:border-neutral-800"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>

                {/* Code Editor */}
                <div className="flex-1" style={{ height: `calc(100% - ${terminalHeight}px)` }}>
                  <Editor
                    height="100%"
                    defaultLanguage={currentFile.language}
                    language={currentFile.language}
                    theme="vs-dark"
                    value={currentFile.content}
                    options={{
                      readOnly: true,
                      minimap: { enabled: false },
                      fontSize: 14,
                      scrollBeyondLastLine: false,
                    }}
                  />
                </div>

                {/* Resize Handle */}
                <div
                  ref={resizeRef}
                  className="h-1 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 cursor-row-resize"
                  onMouseDown={() => isDraggingRef.current = true}
                />

                {/* Terminal */}
                <div 
                  className="bg-neutral-900 text-neutral-100"
                  style={{ height: terminalHeight }}
                >
                  <div className="flex items-center justify-between p-2 bg-neutral-800 border-b border-neutral-700">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">Terminal</span>
                      
                    </div>
                    <button className="text-neutral-400 hover:text-neutral-200">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <div className="p-2 font-mono text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-green-400">➜</span>
                      <span className="text-blue-400">~/project</span>
                      <span className="text-neutral-400">$</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal
        isOpen={activeModal === 'new'}
        onClose={closeModal}
        title="Create New Project"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Project Name
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white bg-white dark:bg-black text-neutral-900 dark:text-white"
              placeholder="My Awesome Project"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Description
            </label>
            <textarea
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white bg-white dark:bg-black text-neutral-900 dark:text-white h-24 resize-none"
              placeholder="Describe your project..."
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={closeModal}
              className="px-4 py-2 text-sm border border-neutral-200 dark:border-neutral-800 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-900 text-neutral-900 dark:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                // Handle project creation
                closeModal();
              }}
              className="px-4 py-2 text-sm bg-neutral-900 dark:bg-white text-white dark:text-black rounded-lg hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors"
            >
              Create Project
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={activeModal === 'open'}
        onClose={closeModal}
        title="Open Project"
      >
        <div className="space-y-4">
          <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg divide-y divide-neutral-200 dark:divide-neutral-800">
            {/* Example projects - replace with actual data */}
            {['Project 1', 'Project 2', 'Project 3'].map((project, index) => (
              <button
                key={index}
                className="w-full px-4 py-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors flex items-center justify-between group"
              >
                <span className="text-neutral-900 dark:text-white">{project}</span>
                <span className="text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-white">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={activeModal === 'save'}
        onClose={closeModal}
        title="Save Project"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
              Save As
            </label>
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full px-3 py-2 border border-neutral-200 dark:border-neutral-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-neutral-900 dark:focus:ring-white bg-white dark:bg-black text-neutral-900 dark:text-white"
              placeholder="Project Name"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={closeModal}
              className="px-4 py-2 text-sm border border-neutral-200 dark:border-neutral-800 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-900 text-neutral-900 dark:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                // Handle project saving
                closeModal();
              }}
              className="px-4 py-2 text-sm bg-neutral-900 dark:bg-white text-white dark:text-black rounded-lg hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors"
            >
              Save Project
            </button>
          </div>
        </div>
      </Modal>

      {/* Voice Mode Modal */}
      {isVoiceMode && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-black rounded-2xl p-8 max-w-md w-full mx-4 relative">
            {/* Close button */}
            <button
              onClick={() => setVoiceMode(false)}
              className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            {/* Orb */}
            <div className="flex flex-col items-center gap-6">
              <div className={`relative w-32 h-32 transition-all duration-500 ${
                isSpeaking ? 'scale-110' : isListening ? 'scale-105' : 'scale-100'
              }`}>
                {/* Outer glow - enhanced when speaking */}
                <div className={`absolute inset-0 rounded-full bg-gradient-to-br from-blue-400/30 to-purple-500/30 blur-2xl transition-opacity ${
                  isSpeaking ? 'opacity-100 animate-pulse' : 'opacity-50'
                }`} />
                {/* Middle glow */}
                <div className={`absolute inset-4 rounded-full bg-gradient-to-br from-blue-400/40 to-purple-500/40 blur-xl transition-opacity ${
                  isSpeaking ? 'opacity-100 animate-pulse' : 'opacity-70'
                }`} />
                {/* Core orb */}
                <div className="absolute inset-8 rounded-full bg-gradient-to-br from-blue-400/80 via-blue-400/50 to-purple-500/80 backdrop-blur-sm shadow-lg" />
                {/* Inner glow */}
                <div className="absolute inset-8 rounded-full bg-gradient-to-tl from-white/10 to-transparent" />
                {/* Shine effect */}
                <div className="absolute inset-[40%] top-[20%] rounded-full bg-white/30 blur-sm" />
                {/* Sound waves when speaking */}
                {isSpeaking && (
                  <>
                    <div className="absolute inset-0 rounded-full border-2 border-purple-500/20 animate-ping" />
                    <div className="absolute inset-0 rounded-full border-2 border-blue-500/20 animate-ping [animation-delay:0.2s]" />
                    <div className="absolute inset-0 rounded-full border-2 border-purple-500/20 animate-ping [animation-delay:0.4s]" />
                  </>
                )}
      </div>

              {/* Live transcript */}
              {transcript && (
                <div className="w-full p-4 rounded-lg bg-neutral-100 dark:bg-neutral-900 text-center">
                  <p className="text-neutral-600 dark:text-neutral-400 text-sm">
                    {transcript}
                  </p>
                </div>
              )}

              {/* Status text */}
              <p className="text-lg text-neutral-600 dark:text-neutral-400">
                {isListening ? "Listening..." : "Click microphone to speak"}
              </p>

              {/* Microphone button */}
              <button
                onClick={toggleListening}
                className={`p-4 rounded-full transition-colors ${
                  isListening
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-neutral-900 dark:bg-white hover:bg-neutral-800 dark:hover:bg-neutral-100'
                }`}
              >
                <svg className={`w-6 h-6 ${
                  isListening ? 'text-white' : 'text-white dark:text-black'
                }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Debug Panel */}
      <DebugPanel projectId={projectId} />
    </div>
  );
}
