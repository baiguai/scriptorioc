/*

INSTALLATION:

Copy this file to the directory where your notes will be.
Run the following:

npm install express body-parser cors

NOTE:
This installs dependencies locally in the current directory.
You only need to run this once per directory.
The node_modules folder and package-lock.json will be created automatically.

Copy over your Scribboleth notes file (rename it as desired).
Below: Set the FILE_PATH, PORT, and if needed NODE_IP


If you have multiple notes there, give your saver.js unique names
and configure the file name and IP to be unique in each.

To run your savers, use:

node saver.js

Then simply open your notes .html file - to save use the key binding: n

*/



//  USER SETTINGS
// ---------------------------------------------------------------------------



// Path to the HTML file you want to save
const FILE_PATH = "./scriptorioc_help.html";
const NODE_IP = "localhost";  // or your LAN IP
const PORT = 3012;

// Backup behavior
const BACKUP_DIR = "./backups";   // where backups go
const MAX_BACKUPS = 200;          // how many to keep (-1 = disabled, 0 = unlimited)
const MAX_DAYS = 0;               // delete backups older than N days (0 = keep forever)





// !@!
// ---------------------------------------------------------------------------
//  (you generally don’t need to edit below this line)
// ---------------------------------------------------------------------------

import express from 'express';
import fs from 'fs';
import path from 'path';
import bodyParser from 'body-parser';

const app = express();
app.use(bodyParser.text({ limit: "50mb" }));

const resolvedFile = path.resolve(FILE_PATH);
const resolvedBackupDir = path.resolve(BACKUP_DIR);
if (!fs.existsSync(resolvedBackupDir)) fs.mkdirSync(resolvedBackupDir, { recursive: true });

// --- Basic CORS for browser requests ---
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, X-Filename");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
});

// --- Save Route ---
app.post("/save", (req, res) => {
    const content = req.body;
    const clientFileName = req.headers['x-filename'];
    
    if (!content) return res.status(400).send("No content received");

    // --- Safety Check: Validate filename matches ---
    if (clientFileName) {
        const serverFileName = path.basename(FILE_PATH);
        // Remove .html extension from client filename for comparison with fileName variable
        const clientBaseName = clientFileName.replace('.html', '');
        const serverBaseName = path.basename(FILE_PATH, '.html');
        
        // Check if the base names match (help vs test, etc.)
        if (clientBaseName !== serverBaseName) {
            console.error(`${getTimeStamp()}SAFETY ERROR: Client filename '${clientFileName}' (base: ${clientBaseName}) does not match server filename '${serverFileName}' (base: ${serverBaseName})`);
            return res.status(403).send(`SAFETY ERROR: Filename mismatch. Client: ${clientFileName}, Server: ${serverFileName}. Save aborted to prevent data overwriting.`);
        }
    }

    try {
        // --- Create a backup first ---
        if (MAX_BACKUPS > -1) {
            if (fs.existsSync(resolvedFile)) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
                const backupPath = path.join(
                    resolvedBackupDir,
                    `${path.basename(resolvedFile, ".html")}_${timestamp}.html`
                );
                fs.copyFileSync(resolvedFile, backupPath);
            }
        }

        // --- Write the new file ---
        fs.writeFileSync(resolvedFile, content, "utf8");

        pruneBackups();
        res.send("File saved successfully");
    } catch (err) {
        console.error(`${getTimeStamp()}Error saving:`, err);
        res.status(500).send("Error saving file");
    }
});

// --- Get Formatted Timestamp
function getTimeStamp() {
    const dateObj = new Date();

    let year = dateObj.getFullYear();

    let month = dateObj.getMonth();
    month = ('0' + (month + 1)).slice(-2);
    // To make sure the month always has 2-character-format. For example, 1 => 01, 2 => 02

    let date = dateObj.getDate();
    date = ('0' + date).slice(-2);
    // To make sure the date always has 2-character-format

    let hour = dateObj.getHours();
    hour = ('0' + hour).slice(-2);
    // To make sure the hour always has 2-character-format

    let minute = dateObj.getMinutes();
    minute = ('0' + minute).slice(-2);
    // To make sure the minute always has 2-character-format

    let second = dateObj.getSeconds();
    second = ('0' + second).slice(-2);
    // To make sure the second always has 2-character-format

    return `${year}/${month}/${date} ${hour}:${minute}:${second}  :  `;
}

// --- Cleanup function ---
function pruneBackups() {
    try {
        const files = fs
            .readdirSync(resolvedBackupDir)
            .filter(f => f.endsWith(".html"))
            .map(f => ({
                name: f,
                time: fs.statSync(path.join(resolvedBackupDir, f)).mtime.getTime(),
            }))
            .sort((a, b) => b.time - a.time); // newest first

        if (MAX_BACKUPS > 0 && files.length > MAX_BACKUPS) {
            const toDelete = files.slice(MAX_BACKUPS);
            for (const f of toDelete)
                fs.unlinkSync(path.join(resolvedBackupDir, f.name));
        }

        if (MAX_DAYS > 0) {
            const cutoff = Date.now() - MAX_DAYS * 24 * 60 * 60 * 1000;
            for (const f of files)
                if (f.time < cutoff)
                    fs.unlinkSync(path.join(resolvedBackupDir, f.name));
        }
    } catch (err) {
        console.error(`${getTimeStamp()}Error pruning backups:`, err);
    }
}

// --- Start server ---
app.listen(PORT, NODE_IP, () => {
    console.log(`Saver ${FILE_PATH} running at http://${NODE_IP}:${PORT}`);
});
