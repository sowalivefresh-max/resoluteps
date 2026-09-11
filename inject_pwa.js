const fs = require('fs');
const path = require('path');
const publicDir = path.join(__dirname, 'public');

const tags = 
    <link rel="manifest" href="manifest.json" />
    <meta name="theme-color" content="#0a192f" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <link rel="apple-touch-icon" href="icon.svg" />
;

fs.readdirSync(publicDir).forEach(file => {
    if (file.endsWith('.html')) {
        const filePath = path.join(publicDir, file);
        let content = fs.readFileSync(filePath, 'utf8');
        if (!content.includes('manifest.json')) {
            content = content.replace(/<head>/, '<head>' + tags);
            fs.writeFileSync(filePath, content, 'utf8');
            console.log('Updated', file);
        }
    }
});
