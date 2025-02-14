import express from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer } from "vite";
import "dotenv/config";

const app = express();
const port = process.env.PORT || 3000;
const apiKey = process.env.OPENAI_API_KEY;

// Current session management
let currentSession = null;

function getCurrentSession() {
  return currentSession;
}

function createPatentSession(title) {
  const sessionId = Date.now().toString();
  const sessionPath = path.join(process.cwd(), 'patents', sessionId);
  fs.mkdirSync(sessionPath, { recursive: true });
  
  currentSession = {
    id: sessionId,
    title,
    path: sessionPath,
    createdAt: new Date(),
    lastModified: new Date()
  };
  
  return currentSession;
}

function updateSessionModified() {
  if (currentSession) {
    currentSession.lastModified = new Date();
  }
}

// Patent functions implementation
const patentFunctions = {
  // Keep track of recent operations to prevent duplicates
  _recentOperations: new Map(),
  
  _checkDuplicate: function(operation, args, timeWindow = 2000) {
    const key = `${operation}-${JSON.stringify(args)}`;
    const now = Date.now();
    const lastTime = this._recentOperations.get(key);
    
    if (lastTime && (now - lastTime) < timeWindow) {
      console.log(`Preventing duplicate ${operation} operation`);
      return true;
    }
    
    this._recentOperations.set(key, now);
    // Clean up old entries
    for (const [k, time] of this._recentOperations.entries()) {
      if (now - time > timeWindow) {
        this._recentOperations.delete(k);
      }
    }
    return false;
  },

  create_template: async (args) => {
    console.log('Creating template with args:', args);
    
    // Check for duplicate operation
    if (patentFunctions._checkDuplicate('create_template', args)) {
      return { success: false, message: "Duplicate operation prevented" };
    }
    
    try {
      const { title } = args;
      const session = createPatentSession(title);

      // Create markdown file with standard patent sections
      const mdPath = path.join(session.path, 'main.md');
      const initialMd = `# ${title}

## Abstract
[Brief summary of the invention]

## Background
[Context and existing solutions]

## Summary
[Overview of the invention]

## Detailed Description
[Complete technical details]

## Claims
[Legal claims of the patent]
`;
      fs.writeFileSync(mdPath, initialMd);
      console.log(`Created patent template at: ${session.path}`);
      
      return { 
        success: true, 
        path: session.path,
        content: initialMd,
        message: `Created new patent document for "${title}". Let's start documenting your invention.`
      };
    } catch (error) {
      console.error('Error creating template:', error);
      return { success: false, error: error.message };
    }
  },

  resume_patent_creation: async () => {
    console.log('Resuming patent creation');
    
    // Check for duplicate operation
    if (patentFunctions._checkDuplicate('resume_patent_creation', {})) {
      return { success: false, message: "Duplicate operation prevented" };
    }
    
    const session = getCurrentSession();
    if (!session) {
      return { 
        success: false, 
        message: "No active patent session found. Would you like to start a new one?" 
      };
    }

    const mdPath = path.join(session.path, 'main.md');
    if (!fs.existsSync(mdPath)) {
      return { success: false, message: "Patent file not found" };
    }

    const content = fs.readFileSync(mdPath, 'utf8');
    return { 
      success: true, 
      session,
      content,
      message: `Reopened patent document for "${session.title}". Let's continue documenting your invention.`
    };
  },

  display_patent: async () => {
    console.log('Displaying patent');
    const session = getCurrentSession();
    if (!session) {
      return { success: false, message: "No active patent session found" };
    }

    const mdPath = path.join(session.path, 'main.md');
    if (!fs.existsSync(mdPath)) {
      return { success: false, message: "Patent file not found" };
    }

    const content = fs.readFileSync(mdPath, 'utf8');
    return { 
      success: true, 
      content,
      message: "Here's your current patent document. Which section would you like to work on?"
    };
  },

  export_as_pdf: async () => {
    const session = getCurrentSession();
    if (!session) {
      return { success: false, message: "No active patent session found" };
    }

    // This is a placeholder for PDF export
    const mdPath = path.join(session.path, 'main.md');
    if (!fs.existsSync(mdPath)) {
      return { success: false, message: "Patent file not found" };
    }

    return { 
      success: true, 
      message: "PDF export will be implemented in a future update",
      path: path.join(session.path, 'patent.pdf')
    };
  },

  send_user_response: async (args) => {
    const session = getCurrentSession();
    if (!session) {
      return { success: false, message: "No active patent session found" };
    }

    const { message } = args;
    console.log('Adding content to patent document:', message);

    try {
      const mdPath = path.join(session.path, 'main.md');
      const currentContent = fs.readFileSync(mdPath, 'utf8');
      
      // Add the new content with a newline
      const updatedContent = currentContent + '\n\n' + message;
      fs.writeFileSync(mdPath, updatedContent);
      
      updateSessionModified();
      
      return { 
        success: true, 
        message: "Content added to the patent document. What else would you like to document?"
      };
    } catch (error) {
      console.error('Error updating patent document:', error);
      return { success: false, error: error.message };
    }
  }
};

// Add JSON body parser middleware
app.use(express.json());

// API route for function calls
app.post("/function", async (req, res) => {
  console.log('Received function call:', req.body);
  const { name, arguments: args } = req.body;
  
  if (!patentFunctions[name]) {
    console.error(`Unknown function: ${name}`);
    return res.status(400).json({ error: `Unknown function: ${name}` });
  }

  try {
    console.log(`Executing function ${name} with args:`, args);
    const result = await patentFunctions[name](args);
    console.log(`Function ${name} result:`, result);
    res.json(result);
  } catch (error) {
    console.error(`Error executing function ${name}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Configure Vite middleware for React client
const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "custom",
});
app.use(vite.middlewares);

// API route for token generation
app.get("/token", async (req, res) => {
  try {
    const response = await fetch(
      "https://api.openai.com/v1/realtime/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-realtime-preview-2024-12-17",
          voice: "verse",
        }),
      },
    );

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Token generation error:", error);
    res.status(500).json({ error: "Failed to generate token" });
  }
});

// Render the React client
app.use("*", async (req, res, next) => {
  const url = req.originalUrl;

  try {
    const template = await vite.transformIndexHtml(
      url,
      fs.readFileSync("./client/index.html", "utf-8"),
    );
    const { render } = await vite.ssrLoadModule("./client/entry-server.jsx");
    const appHtml = await render(url);
    const html = template.replace(`<!--ssr-outlet-->`, appHtml?.html);
    res.status(200).set({ "Content-Type": "text/html" }).end(html);
  } catch (e) {
    vite.ssrFixStacktrace(e);
    next(e);
  }
});

app.listen(port, () => {
  console.log(`Express server running on *:${port}`);
});
