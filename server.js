const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const IMAGES_DIR = path.join(__dirname, 'public', 'images');

const SUPPORTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif'];

// Serve static files (HTML, CSS, JS, images)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API: Return list of all images in /public/images (shuffled)
app.get('/api/images', (req, res) => {
  try {
    if (!fs.existsSync(IMAGES_DIR)) {
      fs.mkdirSync(IMAGES_DIR, { recursive: true });
    }

    const files = fs.readdirSync(IMAGES_DIR).filter(file => {
      const ext = path.extname(file).toLowerCase();
      return SUPPORTED_EXTENSIONS.includes(ext);
    });

    // Shuffle array (Fisher-Yates)
    for (let i = files.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [files[i], files[j]] = [files[j], files[i]];
    }

    const images = files.map(file => ({
      filename: file,
      url: `/images/${encodeURIComponent(file)}`,
      title: path.basename(file, path.extname(file)).replace(/[-_]/g, ' '),
    }));

    res.json({ images, total: images.length });
  } catch (err) {
    console.error('Error reading images directory:', err);
    res.status(500).json({ error: 'Could not read images directory' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', imagesDir: IMAGES_DIR });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Swipe Rating App running at http://localhost:${PORT}`);
  console.log(`📁 Images directory: ${IMAGES_DIR}`);
  console.log(`   → Place your images there and reload the app.\n`);
});
