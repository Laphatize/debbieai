const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs-extra');
const { OpenAI } = require('openai');
const dotenv = require('dotenv').config();

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
        // Try to create a test server to check port availability
        await new Promise((resolve, reject) => {
          const testServer = express().listen(port, () => {
            testServer.close(() => resolve());
          });
          testServer.on('error', () => {
            port++;
            lastUsedPort = port;
            resolve();
          });
        });
        isPortAvailable = true;
      } catch (error) {
        port++;
        lastUsedPort = port;
      }
    }

    console.log(`Found available port: ${port}`);

    // Create static file server
    const staticApp = express();
    
    // Configure CORS and caching headers
    staticApp.use((req, res, next) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('X-Frame-Options', 'ALLOWALL');
      res.setHeader('Content-Security-Policy', "frame-ancestors *");
      
      // Prevent caching
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      res.setHeader('Surrogate-Control', 'no-store');
      
      next();
    });

    // Request logging
    staticApp.use((req, res, next) => {
      console.log(`[${projectId}] ${req.method} ${req.url}`);
      next();
    });

    // Serve static files with custom caching strategy
    staticApp.use(express.static(projectDir, {
      etag: false,
      lastModified: false,
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'no-store');
      }
    }));
    
    // Start server
    console.log(`Starting server on port ${port}`);
    const server = staticApp.listen(port);

    // Verify server started
    await new Promise((resolve, reject) => {
      server.on('listening', () => {
        console.log(`Server successfully started on port ${port}`);
        resolve();
      });
      server.on('error', (err) => {
        console.error(`Failed to start server on port ${port}:`, err);
        reject(err);
      });
    });

    // Store deployment info
    const deployment = {
      projectId,
      port,
      server,
      directory: projectDir,
      createdAt: new Date(),
      files: files.map(f => f.name)
    };
    deployedServers.set(projectId, deployment);

    console.log(`Deployment successful on port ${port}`);
    return deployment;
  } catch (error) {
    console.error('Deployment error:', error);
    // Cleanup on failure
    try {
      await fs.remove(projectDir);
      console.log('Cleaned up project directory after failure');
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError);
    }
    throw error;
  }
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
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'No prompt provided'
      });
    }

    console.log('Generating code for prompt:', prompt);
    console.log('Context:', JSON.stringify(context, null, 2));

    const openai = new OpenAI(process.env.OPENAI_API_KEY);
    
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured');
    }

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

    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4",
        temperature: 0.7, // Add some randomness to avoid repetitive responses
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
      console.log('Generated response received');

      try {
        // Try to extract JSON if it's wrapped in other text
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
        
        const responseData = JSON.parse(jsonStr);
        
        // Validate response structure
        if (!responseData.explanation || !Array.isArray(responseData.files)) {
          throw new Error('Invalid response structure');
        }

        // Ensure all required files are present
        const requiredFiles = context.files.map(f => f.name);
        const responseFiles = responseData.files.map(f => f.name);
        const missingFiles = requiredFiles.filter(f => !responseFiles.includes(f));

        if (missingFiles.length > 0) {
          // If files are missing, add them from the original
          const originalFiles = context.files.filter(f => missingFiles.includes(f.name));
          responseData.files.push(...originalFiles);
          responseData.explanation += ' (Some files were preserved from original)';
        }

        return res.json(responseData);
      } catch (parseError) {
        console.error('Failed to parse AI response:', parseError);
        console.error('Raw response:', responseText);
        
        // Return original files with error message
        return res.json({
          explanation: "Failed to update files due to an error. Original files preserved.",
          files: context.files
        });
      }
    } catch (openaiError) {
      console.error('OpenAI API error:', openaiError);
      throw new Error('Failed to generate code: ' + openaiError.message);
    }
  } catch (error) {
    console.error('Generation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add cleanup for terminated servers
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);

async function cleanup() {
  console.log('Cleaning up servers...');
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