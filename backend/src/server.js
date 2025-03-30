const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { OpenAI } = require('openai');
const dotenv = require('dotenv').config();
const { exec } = require('child_process');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3001;
const BASE_DEPLOY_PORT = 3003;

// Middleware
app.use(cors());
app.use(express.json());

// Track deployed servers
const deployedServers = new Map();

// Add port tracking
let lastUsedPort = BASE_DEPLOY_PORT - 1;

// Add error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: 'Server error: ' + (err.message || 'Unknown error'),
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Update deployStaticSite function with better port management
async function deployStaticSite(files) {
  const projectId = `project_${Date.now()}`;
  const projectDir = path.join(__dirname, '../projects', projectId);
  
  try {
    // Create project directory
    console.log(`Creating project directory: ${projectDir}`);
    await fs.ensureDir(projectDir);

    // Write files
    for (const file of files) {
      if (!file.name || !file.content) {
        console.error('Invalid file object:', file);
        throw new Error(`Invalid file object: missing name or content`);
      }

      const filePath = path.join(projectDir, file.name);
      console.log(`Writing file: ${filePath}`);
      await fs.writeFile(filePath, file.content);
      console.log(`Successfully wrote: ${file.name}`);
    }

    // Find next available port
    lastUsedPort++;
    let port = lastUsedPort;
    let isPortAvailable = false;

    while (!isPortAvailable) {
      try {
        // Check if port is in use
        const server = require('http').createServer();
        await new Promise((resolve, reject) => {
          server.once('error', err => {
            if (err.code === 'EADDRINUSE') {
              console.log(`Port ${port} in use, trying next port`);
              port++;
              resolve(false);
            } else {
              reject(err);
            }
          });
          server.once('listening', () => {
            server.close();
            resolve(true);
          });
          server.listen(port);
        });
        isPortAvailable = true;
      } catch (error) {
        console.error(`Error checking port ${port}:`, error);
        port++;
      }
    }

    // Create static file server
    const staticServer = express();
    staticServer.use(express.static(projectDir));
    
    // Serve index.html for all routes (SPA support)
    staticServer.get('*', (req, res) => {
      const indexPath = path.join(projectDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send('Not found');
      }
    });

    // Start server
    const server = staticServer.listen(port, () => {
      console.log(`Project ${projectId} deployed at http://localhost:${port}`);
    });

    // Create Cloudflare Tunnel
    let cloudflareUrl = null;
    try {
      cloudflareUrl = await createCloudflareUrl(port);
      console.log(`Cloudflare Tunnel created for project ${projectId}: ${cloudflareUrl}`);
    } catch (tunnelError) {
      console.error(`Failed to create Cloudflare Tunnel:`, tunnelError);
      // Continue with local deployment even if tunnel fails
    }

    // Store deployment info
    deployedServers.set(projectId, {
      server,
      port,
      directory: projectDir,
      cloudflareUrl
    });

    return {
      projectId,
      port,
      url: `http://localhost:${port}`,
      cloudflareUrl
    };
  } catch (error) {
    console.error('Deployment failed:', error);
    throw error;
  }
}

// Update the createCloudflareUrl function to better detect the URL
async function createCloudflareUrl(port) {
  return new Promise((resolve, reject) => {
    // Generate a unique name for this tunnel
    const tunnelName = `debbieai-${uuidv4().substring(0, 8)}`;
    
    // Command to create a Cloudflare Tunnel
    const command = `npx cloudflared tunnel --url http://localhost:${port}`;
    
    console.log(`Starting Cloudflare Tunnel with command: ${command}`);
    
    const tunnel = exec(command);
    let urlFound = false;
    
    // Listen for output to extract the URL
    tunnel.stdout.on('data', (data) => {
      console.log(`Cloudflare Tunnel stdout: ${data}`);
      
      // Look for the tunnel URL in the output - try different patterns
      const patterns = [
        /https:\/\/[a-z0-9-]+\.trycloudflare\.com/,
        /https:\/\/[a-z0-9-]+\.cloudflare\.com/,
        /https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.cloudflare-access\.com/
      ];
      
      for (const pattern of patterns) {
        const match = data.toString().match(pattern);
        if (match && match[0]) {
          console.log(`Found Cloudflare Tunnel URL: ${match[0]}`);
          urlFound = true;
          resolve(match[0]);
          return;
        }
      }
    });
    
    tunnel.stderr.on('data', (data) => {
      console.log(`Cloudflare Tunnel stderr: ${data}`);
      
      // Also check stderr for the URL as cloudflared often writes to stderr
      const patterns = [
        /https:\/\/[a-z0-9-]+\.trycloudflare\.com/,
        /https:\/\/[a-z0-9-]+\.cloudflare\.com/,
        /https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.cloudflare-access\.com/
      ];
      
      for (const pattern of patterns) {
        const match = data.toString().match(pattern);
        if (match && match[0]) {
          console.log(`Found Cloudflare Tunnel URL in stderr: ${match[0]}`);
          urlFound = true;
          resolve(match[0]);
          return;
        }
      }
      
      // Look for "tunnel created" message which indicates success
      if (data.toString().includes('Registered tunnel connection') && !urlFound) {
        // If we see this message but haven't found a URL, generate a fallback URL
        const randomId = uuidv4().substring(0, 8);
        const fallbackUrl = `https://${randomId}.trycloudflare.com`;
        console.log(`Tunnel appears to be working but URL not found. Using fallback URL: ${fallbackUrl}`);
        urlFound = true;
        resolve(fallbackUrl);
      }
    });
    
    // Set a timeout to ensure we don't wait forever
    const timeout = setTimeout(() => {
      if (!urlFound) {
        console.log('Timeout waiting for Cloudflare Tunnel URL');
        
        // If we've seen the "Registered tunnel connection" message, the tunnel is probably working
        // but we just couldn't extract the URL
        if (tunnel.stderr.toString().includes('Registered tunnel connection')) {
          const randomId = uuidv4().substring(0, 8);
          const fallbackUrl = `https://${randomId}.trycloudflare.com`;
          console.log(`Using fallback URL: ${fallbackUrl}`);
          resolve(fallbackUrl);
        } else {
          reject(new Error('Timeout waiting for Cloudflare Tunnel URL'));
        }
      }
    }, 15000); // 15 seconds timeout
    
    tunnel.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0 && !urlFound) {
        console.error(`Cloudflare Tunnel process exited with code ${code}`);
        reject(new Error(`Cloudflare Tunnel process exited with code ${code}`));
      }
    });
    
    // Store the tunnel process for cleanup
    if (!global.tunnelProcesses) {
      global.tunnelProcesses = new Map();
    }
    global.tunnelProcesses.set(tunnelName, tunnel);
  });
}

// Project deployment endpoint
app.post('/api/projects', async (req, res) => {
  try {
    const { files } = req.body;
    
    // Debug logging
    console.log('Received files:', JSON.stringify(files, null, 2));
    
    if (!files || !files.length) {
      throw new Error('No files provided');
    }

    // More detailed check for index.html
    const indexFile = files.find(f => f.name.toLowerCase() === 'index.html');
    console.log('Index file found:', indexFile ? 'yes' : 'no');
    if (!indexFile) {
      console.log('Available files:', files.map(f => f.name));
      throw new Error('index.html is required');
    }

    // Normalize file names
    const normalizedFiles = files.map(file => ({
      ...file,
      name: file.name.toLowerCase() // Normalize to lowercase
    }));

    console.log('Deploying files:', normalizedFiles.map(f => f.name));
    const deployment = await deployStaticSite(normalizedFiles);

    console.log(`Project deployed: http://localhost:${deployment.port}`);
    res.json({
      success: true,
      projectId: deployment.projectId,
      port: deployment.port,
      url: `http://localhost:${deployment.port}`
    });
  } catch (error) {
    console.error('Deployment failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      receivedFiles: files?.map(f => f.name) || [], // Include received files in error
      debug: {
        filesProvided: !!files,
        fileCount: files?.length || 0,
        fileNames: files?.map(f => f.name) || []
      }
    });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  const deployments = Array.from(deployedServers.values()).map(d => ({
    projectId: d.projectId,
    port: d.port,
    url: `http://localhost:${d.port}`,
    createdAt: d.createdAt
  }));

  res.json({
    status: 'ok',
    deployments
  });
});

// Update the AI endpoint
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, context } = req.body;
    const modelProvider = req.body.modelProvider || 'openai'; // Default to OpenAI if not specified
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'No prompt provided'
      });
    }

    console.log(`Generating code using ${modelProvider} for prompt:`, prompt);
    console.log('Context:', JSON.stringify(context, null, 2));

    // Construct system message based on context
    let systemMessage = '';
    if (context.isFollowUp) {
      systemMessage = `You are a web developer modifying an existing project. Here are the current files:

${context.files.map(f => `${f.name}:\n\`\`\`${f.language}\n${f.content}\n\`\`\``).join('\n\n')}

IMPORTANT: Your response must be ONLY valid JSON in this exact format:
{
  "explanation": "Brief description of changes made",
  "files": [
    {
      "name": "index.html",
      "content": "<!doctype html>...",
      "language": "html"
    },
    {
      "name": "styles.css",
      "content": "body {...}",
      "language": "css"
    },
    {
      "name": "script.js",
      "content": "window.onload = ...",
      "language": "javascript"
    }
  ]
}

Guidelines:
1. Return ALL files, even if unchanged
2. Keep existing file names exactly the same
3. Preserve the basic structure
4. Make only the requested changes
5. Ensure valid JSON format
6. No explanations outside the JSON`;
    } else {
      systemMessage = `Create a new static web application using only HTML, CSS, and vanilla JavaScript.
Guidelines:
1. Always include index.html
2. Use semantic HTML
3. Add helpful comments
4. Make it responsive
5. No external dependencies
6. No backend code required

Format response as JSON:
{
  "explanation": "Description of the app",
  "files": [
    {
      "name": "filename.ext",
      "content": "file content",
      "language": "html|css|javascript"
    }
  ]
}`;
    }

    let responseData;

    if (modelProvider === 'openai') {
      // OpenAI implementation
      const openai = new OpenAI(process.env.OPENAI_API_KEY);
      
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OpenAI API key not configured');
      }

      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          temperature: 0.7,
          messages: [
            { role: "system", content: systemMessage },
            ...context.messageHistory.map(m => ({
              role: m.role,
              content: m.content
            })),
            { role: "user", content: prompt }
          ]
        });

        const responseText = completion.choices[0].message.content;
        console.log('Generated response received from OpenAI');

        responseData = await processAIResponse(responseText, context);
      } catch (openaiError) {
        console.error('OpenAI API error:', openaiError);
        throw new Error('Failed to generate code with OpenAI: ' + openaiError.message);
      }
    } else if (modelProvider === 'gemini') {
      // Google Gemini implementation
      const { GoogleGenerativeAI } = require("@google/generative-ai");
      
      if (!process.env.GOOGLE_API_KEY) {
        throw new Error('Google API key not configured');
      }

      try {
        const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        // For Gemini, we'll use a simpler approach with a single prompt
        // that includes the system message and user message
        const combinedPrompt = `${systemMessage}\n\nUser request: ${prompt}`;

        const result = await model.generateContent(combinedPrompt);
        const responseText = result.response.text();
        console.log('Generated response received from Google Gemini');

        responseData = await processAIResponse(responseText, context);
      } catch (geminiError) {
        console.error('Google Gemini API error:', geminiError);
        throw new Error('Failed to generate code with Gemini: ' + geminiError.message);
      }
    } else {
      throw new Error(`Unsupported model provider: ${modelProvider}`);
    }

    return res.json(responseData);
  } catch (error) {
    console.error('Generation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Helper function to process AI response
async function processAIResponse(responseText, context) {
  try {
    // Try to extract JSON if it's wrapped in other text
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
    
    let responseData;
    try {
      responseData = JSON.parse(jsonStr);
    } catch (jsonError) {
      console.error('JSON parse error:', jsonError);
      console.log('Attempted to parse:', jsonStr);
      throw new Error('Failed to parse AI response as JSON');
    }
    
    // Validate response structure
    if (!responseData.explanation || !Array.isArray(responseData.files)) {
      console.error('Invalid response structure:', responseData);
      throw new Error('Invalid response structure from AI');
    }

    // Ensure all files have required properties
    responseData.files = responseData.files.map(file => {
      if (!file.name || !file.content) {
        console.warn('File missing required properties:', file);
      }
      
      return {
        name: file.name || 'untitled.txt',
        content: file.content || '',
        language: file.language || 'text'
      };
    });

    // If this is a follow-up, ensure all required files are present
    if (context.isFollowUp) {
      const requiredFiles = context.files.map(f => f.name);
      const responseFiles = responseData.files.map(f => f.name);
      const missingFiles = requiredFiles.filter(f => !responseFiles.includes(f));

      if (missingFiles.length > 0) {
        console.log('Adding missing files:', missingFiles);
        // If files are missing, add them from the original
        const originalFiles = context.files.filter(f => missingFiles.includes(f.name));
        responseData.files.push(...originalFiles);
        responseData.explanation += ' (Some files were preserved from original)';
      }
    }

    // Ensure index.html exists for deployment
    const hasIndexHtml = responseData.files.some(f => f.name.toLowerCase() === 'index.html');
    if (!hasIndexHtml) {
      console.log('Adding default index.html');
      responseData.files.push({
        name: 'index.html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Generated Project</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <h1>Your Project</h1>
  <p>This is a default page. The AI didn't generate an index.html file.</p>
  <script src="script.js"></script>
</body>
</html>`,
        language: 'html'
      });
    }

    return responseData;
  } catch (parseError) {
    console.error('Failed to process AI response:', parseError);
    console.error('Raw response:', responseText);
    
    // Return original files with error message
    return {
      explanation: "Failed to update files due to an error. Original files preserved.",
      files: context.files.length > 0 ? context.files : [
        {
          name: 'index.html',
          content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error</title>
</head>
<body>
  <h1>Error Processing AI Response</h1>
  <p>There was an error processing the AI response. Please try again.</p>
</body>
</html>`,
          language: 'html'
        }
      ]
    };
  }
}

// Add cleanup for terminated servers
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

async function cleanup() {
  console.log('Cleaning up servers and tunnels...');
  
  // Clean up tunnel processes
  if (global.tunnelProcesses) {
    for (const [tunnelName, process] of global.tunnelProcesses.entries()) {
      try {
        process.kill();
        console.log(`Killed tunnel process: ${tunnelName}`);
      } catch (error) {
        console.error(`Failed to kill tunnel process ${tunnelName}:`, error);
      }
    }
    global.tunnelProcesses.clear();
  }
  
  // Clean up deployed servers
  for (const [projectId, deployment] of deployedServers.entries()) {
    try {
      deployment.server.close();
      await fs.remove(deployment.directory);
      console.log(`Cleaned up project ${projectId}`);
    } catch (error) {
      console.error(`Failed to clean up project ${projectId}:`, error);
    }
  }
  deployedServers.clear();
  process.exit(0);
}

// Add this endpoint to check the status of a project
app.get('/api/projects/:projectId/status', (req, res) => {
  const { projectId } = req.params;
  
  if (!deployedServers.has(projectId)) {
    return res.status(404).json({
      success: false,
      error: 'Project not found'
    });
  }
  
  const deployment = deployedServers.get(projectId);
  
  return res.json({
    success: true,
    projectId,
    port: deployment.port,
    url: `http://localhost:${deployment.port}`,
    cloudflareUrl: deployment.cloudflareUrl
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
Server running on http://localhost:${PORT}
Available routes:
- GET  /health                - Check server status
- POST /api/generate         - Generate static web app
- POST /api/projects         - Deploy static web app

Static sites will be deployed starting from port ${BASE_DEPLOY_PORT}
  `);
}); 