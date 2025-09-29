require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure Multer for file upload
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
});

// In-memory storage for file metadata (dalam produksi gunakan database)
let filesDatabase = [];
let statsDatabase = {
  totalUploads: 0,
  totalImages: 0,
  totalVideos: 0,
  totalOthers: 0
};

// API Routes

// Get all files
app.get('/api/files', (req, res) => {
  res.json({
    success: true,
    files: filesDatabase,
    stats: statsDatabase
  });
});

// Upload file
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Determine resource type
    let resourceType = 'auto';
    if (req.file.mimetype.startsWith('video/')) {
      resourceType = 'video';
    } else if (req.file.mimetype.startsWith('image/')) {
      resourceType = 'image';
    } else {
      resourceType = 'raw';
    }

    // Upload to Cloudinary
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        resource_type: resourceType,
        folder: 'uploads',
        use_filename: true,
        unique_filename: true
      },
      (error, result) => {
        if (error) {
          console.error('Cloudinary upload error:', error);
          return res.status(500).json({
            success: false,
            message: 'Upload failed',
            error: error.message
          });
        }

        // Save file metadata
        const fileData = {
          id: result.public_id,
          name: req.file.originalname,
          type: req.file.mimetype,
          size: req.file.size,
          url: result.secure_url,
          thumbnail: result.thumbnail_url || result.secure_url,
          timestamp: new Date().toISOString(),
          format: result.format,
          resourceType: result.resource_type
        };

        filesDatabase.unshift(fileData);

        // Update stats
        statsDatabase.totalUploads++;
        if (req.file.mimetype.startsWith('image/')) {
          statsDatabase.totalImages++;
        } else if (req.file.mimetype.startsWith('video/')) {
          statsDatabase.totalVideos++;
        } else {
          statsDatabase.totalOthers++;
        }

        res.json({
          success: true,
          message: 'File uploaded successfully',
          file: fileData,
          stats: statsDatabase
        });
      }
    );

    uploadStream.end(req.file.buffer);

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Delete file
app.delete('/api/files/:id', async (req, res) => {
  try {
    const fileId = req.params.id;
    const fileIndex = filesDatabase.findIndex(f => f.id === fileId);

    if (fileIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    const file = filesDatabase[fileIndex];

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(fileId, {
      resource_type: file.resourceType || 'image'
    });

    // Update stats
    statsDatabase.totalUploads--;
    if (file.type.startsWith('image/')) {
      statsDatabase.totalImages--;
    } else if (file.type.startsWith('video/')) {
      statsDatabase.totalVideos--;
    } else {
      statsDatabase.totalOthers--;
    }

    // Remove from database
    filesDatabase.splice(fileIndex, 1);

    res.json({
      success: true,
      message: 'File deleted successfully',
      stats: statsDatabase
    });

  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Delete failed',
      error: error.message
    });
  }
});

// Get stats
app.get('/api/stats', (req, res) => {
  res.json({
    success: true,
    stats: statsDatabase
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    cloudinary: !!process.env.CLOUDINARY_CLOUD_NAME
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Visit: http://localhost:${PORT}`);
});

module.exports = app;