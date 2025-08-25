import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import archiver from 'archiver';
import { processImagesInFolder } from '../services/imageProcessor';

const router = Router();
const RAW_DATA_PATH = path.resolve(process.cwd(), 'dataset', 'raw-data');
const LABELED_DATA_PATH = path.resolve(process.cwd(), 'dataset', 'labeled-data');

// GET /folders - List subdirectories in dataset/raw-data
router.get('/folders', async (req, res) => {
  try {
    const entries = await fs.readdir(RAW_DATA_PATH, { withFileTypes: true });
    const folders = entries
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    res.json(folders);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // If raw-data directory doesn't exist, return an empty array
      return res.json([]);
    }
    console.error('Failed to list folders:', error);
    res.status(500).json({ error: 'Failed to list dataset folders' });
  }
});

// GET /fields/:folder - Get the fields.json for a specific folder
router.get('/fields/:folder', async (req, res) => {
  const { folder } = req.params;
  const filePath = path.join(RAW_DATA_PATH, folder, 'fields.json');

  try {
    const data = await fs.readFile(filePath, 'utf-8');
    res.json(JSON.parse(data));
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Field set not found.' });
    }
    console.error(`Failed to read fields for folder ${folder}:`, error);
    res.status(500).json({ error: 'Failed to read field set' });
  }
});

// POST /fields/:folder - Create or update the fields.json for a folder
router.post('/fields/:folder', async (req, res) => {
  const { folder } = req.params;
  const fieldSet = req.body;

  const rawPath = path.join(RAW_DATA_PATH, folder, 'fields.json');
  const labeledPath = path.join(LABELED_DATA_PATH, folder, 'fields.json');

  try {
    // Ensure parent directories exist
    await fs.mkdir(path.dirname(rawPath), { recursive: true });
    await fs.mkdir(path.dirname(labeledPath), { recursive: true });

    const data = JSON.stringify(fieldSet, null, 2);

    // Write to both locations
    await fs.writeFile(rawPath, data);
    await fs.writeFile(labeledPath, data);

    res.status(200).json({ message: 'Field set saved successfully.' });
  } catch (error) {
    console.error(`Failed to write fields for folder ${folder}:`, error);
    res.status(500).json({ error: 'Failed to save field set' });
  }
});

// GET /images/:folder - List images in a specific folder
router.get('/images/:folder', async (req, res) => {
  const { folder } = req.params;
  const folderPath = path.join(RAW_DATA_PATH, folder);
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

  // --- Trigger preprocessing in the background ---
  processImagesInFolder(folder);
  // --- Don't await, let it run in the background ---

  try {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const imageFiles = entries
      .filter(dirent => dirent.isFile() && imageExtensions.includes(path.extname(dirent.name).toLowerCase()))
      .map(dirent => dirent.name);
    res.json(imageFiles);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Folder not found.' });
    }
    console.error(`Failed to list images for folder ${folder}:`, error);
    res.status(500).json({ error: 'Failed to list images' });
  }
});

// GET /label/:folder/:img - Get the label for a specific image
router.get('/label/:folder/:img', async (req, res) => {
  const { folder, img } = req.params;
  const labelFileName = `${path.parse(img).name}.json`;
  const filePath = path.join(LABELED_DATA_PATH, folder, 'labels', labelFileName);

  try {
    const data = await fs.readFile(filePath, 'utf-8');
    res.json(JSON.parse(data));
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      return res.status(404).json({ error: 'Label not found.' });
    }
    console.error(`Failed to read label for ${img} in ${folder}:`, error);
    res.status(500).json({ error: 'Failed to read label' });
  }
});

// POST /label/:folder/:img - Create or update the label for an image
router.post('/label/:folder/:img', async (req, res) => {
  const { folder, img } = req.params;
  const labelData = req.body;
  
  const labelFileName = `${path.parse(img).name}.json`;
  const labelsDir = path.join(LABELED_DATA_PATH, folder, 'labels');
  const filePath = path.join(labelsDir, labelFileName);

  try {
    await fs.mkdir(labelsDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(labelData, null, 2));
    res.status(200).json({ message: 'Label saved successfully.' });
  } catch (error) {
    console.error(`Failed to write label for ${img} in ${folder}:`, error);
    res.status(500).json({ error: 'Failed to save label' });
  }
});

// GET /export/:folder - Export labeled data as a zip file
router.get('/export/:folder', (req, res) => {
  const { folder } = req.params;
  const directoryToZip = path.join(LABELED_DATA_PATH, folder);
  const zipFileName = `${folder}-labeled-data.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

  const archive = archiver('zip', {
    zlib: { level: 9 }, // Sets the compression level.
  });

  archive.on('warning', (err) => {
    if (err.code === 'ENOENT') {
      console.warn('Archiver warning: ', err);
    } else {
      res.status(500).send({ error: err.message });
    }
  });

  archive.on('error', (err) => {
    res.status(500).send({ error: err.message });
  });

  archive.pipe(res);
  archive.directory(directoryToZip, false);
  archive.finalize();
});

// GET /labels/:folder - List all label files in a folder
router.get('/labels/:folder', async (req, res) => {
  const { folder } = req.params;
  const labelsDir = path.join(LABELED_DATA_PATH, folder, 'labels');

  try {
    const entries = await fs.readdir(labelsDir, { withFileTypes: true });
    const labelFiles = entries
      .filter(dirent => dirent.isFile() && dirent.name.endsWith('.json'))
      .map(dirent => dirent.name);
    res.json(labelFiles);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // If the labels directory doesn't exist, it means no labels have been created yet.
      return res.json([]);
    }
    console.error(`Failed to list labels for folder ${folder}:`, error);
    res.status(500).json({ error: 'Failed to list labels' });
  }
});


export default router;
