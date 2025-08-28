import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import archiver from 'archiver';
import { processImagesInFolder, drawBoxesOnImage, initializeProcessedImage, rotateProcessedImage, resetImageToPreprocessed, type ImageLabel } from '../services/imageProcessor';

const router = Router();
const RAW_DATA_PATH = path.resolve(process.cwd(), 'dataset', 'raw-data');
const LABELED_DATA_PATH = path.resolve(process.cwd(), 'dataset', 'labeled-data');

// GET /folders - List subdirectories in dataset/raw-data
router.get('/folders', async (_req, res) => {
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

  // Ensure preprocessing completes before returning the image list
  await processImagesInFolder(folder);

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
  const labelsFilePath = path.join(LABELED_DATA_PATH, folder, 'labels.json');

  try {
    const data = await fs.readFile(labelsFilePath, 'utf-8');
    const allLabels: Record<string, ImageLabel> = JSON.parse(data);
    const imageLabel = allLabels[img];
    
    if (imageLabel) {
      res.json(imageLabel);
    } else {
      res.status(404).json({ error: 'Label not found.' });
    }
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
  const labelData: ImageLabel = req.body;
  
  const labelsDir = path.join(LABELED_DATA_PATH, folder);
  const labelsFilePath = path.join(labelsDir, 'labels.json');

  try {
    await fs.mkdir(labelsDir, { recursive: true });
    
    // Read existing labels or create empty object
    let allLabels: Record<string, ImageLabel> = {};
    try {
      const existingData = await fs.readFile(labelsFilePath, 'utf-8');
      allLabels = JSON.parse(existingData);
    } catch (readError: any) {
      if (readError.code !== 'ENOENT') {
        console.warn(`Error reading existing labels.json for ${folder}:`, readError);
      }
    }

    // Update the specific image label
    allLabels[img] = labelData;
    
    // Write back the updated labels
    await fs.writeFile(labelsFilePath, JSON.stringify(allLabels, null, 2));

    // 总是将图片保存到processed-images文件夹（不管是否有框）
    await drawBoxesOnImage(folder, img, labelData.boxes || [], labelData.rotation || 0);

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

// GET /labels/:folder - Get all labels for a folder
router.get('/labels/:folder', async (req, res) => {
  const { folder } = req.params;
  const labelsFilePath = path.join(LABELED_DATA_PATH, folder, 'labels.json');

  try {
    const data = await fs.readFile(labelsFilePath, 'utf-8');
    const allLabels: Record<string, ImageLabel> = JSON.parse(data);
    res.json(allLabels);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // If the labels file doesn't exist, return empty object
      return res.json({});
    }
    console.error(`Failed to read labels for folder ${folder}:`, error);
    res.status(500).json({ error: 'Failed to read labels' });
  }
});

// POST /reset/:folder/:img - 重置图片：删除processed图片，复制preprocessed到processed，清除标注数据
router.post('/reset/:folder/:img', async (req, res) => {
  const { folder, img } = req.params;
  const labelsDir = path.join(LABELED_DATA_PATH, folder);
  const labelsFilePath = path.join(labelsDir, 'labels.json');

  try {
    // 1. 删除processed-images中的图片（如果存在）
    await resetImageToPreprocessed(folder, img);
    
    // 2. 重新初始化processed图片（rotation = 0）
    await initializeProcessedImage(folder, img, 0);
    
    // 3. 清除labels.json中的标注数据
    let allLabels: Record<string, ImageLabel> = {};
    try {
      const existingData = await fs.readFile(labelsFilePath, 'utf-8');
      allLabels = JSON.parse(existingData);
    } catch (readError: any) {
      if (readError.code !== 'ENOENT') {
        console.warn(`Error reading existing labels.json for ${folder}:`, readError);
      }
    }

    // 删除该图片的标注数据
    delete allLabels[img];
    
    // 写回更新后的labels
    await fs.writeFile(labelsFilePath, JSON.stringify(allLabels, null, 2));

    console.log(`[Reset] Successfully reset ${img}: deleted old processed image and created new one with rotation 0`);
    res.status(200).json({ message: 'Image reset successfully.' });
  } catch (error) {
    console.error(`Failed to reset image ${img} in ${folder}:`, error);
    res.status(500).json({ error: 'Failed to reset image' });
  }
});

// POST /initialize/:folder/:img - 初始化processed图片（用于进入标注界面时）
router.post('/initialize/:folder/:img', async (req, res) => {
  const { folder, img } = req.params;
  const labelsDir = path.join(LABELED_DATA_PATH, folder);
  const labelsFilePath = path.join(labelsDir, 'labels.json');
  const processedImagePath = path.join(LABELED_DATA_PATH, folder, 'processed-images', img);

  try {
    // 检查processed图片是否已存在
    let processedImageExists = false;
    try {
      await fs.access(processedImagePath);
      processedImageExists = true;
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error; // 其他错误需要抛出
      }
    }

    // 读取现有标签数据
    let hasExistingLabel = false;
    let currentRotation = 0;
    try {
      const existingData = await fs.readFile(labelsFilePath, 'utf-8');
      const allLabels = JSON.parse(existingData);
      if (allLabels[img]) {
        hasExistingLabel = true;
        if (typeof allLabels[img].rotation === 'number') {
          currentRotation = allLabels[img].rotation;
        }
      }
    } catch (readError: any) {
      if (readError.code !== 'ENOENT') {
        console.warn(`Error reading existing labels.json for ${folder}:`, readError);
      }
    }

    // 只有在processed图片不存在时才初始化
    if (!processedImageExists) {
      await initializeProcessedImage(folder, img, currentRotation);
      
      // 如果有已存在的标注数据，需要在图片上绘制标注框
      if (hasExistingLabel) {
        try {
          const existingData = await fs.readFile(labelsFilePath, 'utf-8');
          const allLabels = JSON.parse(existingData);
          const existingBoxes = allLabels[img]?.boxes || [];
          
          if (existingBoxes.length > 0) {
            const existingRotation = allLabels[img]?.rotation || 0;
            await drawBoxesOnImage(folder, img, existingBoxes, existingRotation);
            console.log(`[Initialize] Restored ${existingBoxes.length} boxes on processed image for ${img} with rotation ${existingRotation}`);
          }
        } catch (error) {
          console.warn(`[Initialize] Failed to restore boxes for ${img}:`, error);
        }
      }
      
      console.log(`[Initialize] Created processed image for ${img} with rotation ${currentRotation}`);
      res.status(200).json({ 
        message: 'Processed image initialized successfully.',
        action: 'initialized',
        hasExistingLabel
      });
    } else {
      console.log(`[Initialize] Processed image ${img} already exists, skipping initialization`);
      res.status(200).json({ 
        message: 'Processed image already exists.',
        action: 'skipped'
      });
    }
  } catch (error) {
    console.error(`Failed to initialize processed image ${img} in ${folder}:`, error);
    res.status(500).json({ error: 'Failed to initialize processed image' });
  }
});

// POST /rotate/:folder/:img - 旋转图片并更新rotation字段
router.post('/rotate/:folder/:img', async (req, res) => {
  const { folder, img } = req.params;
  const { rotation } = req.body; // 相对旋转角度：90, 180, 270
  const labelsDir = path.join(LABELED_DATA_PATH, folder);
  const labelsFilePath = path.join(labelsDir, 'labels.json');

  try {
    // 读取现有标签数据
    let allLabels: Record<string, ImageLabel> = {};
    let currentRotation = 0;
    
    try {
      const existingData = await fs.readFile(labelsFilePath, 'utf-8');
      allLabels = JSON.parse(existingData);
      if (allLabels[img] && typeof allLabels[img].rotation === 'number') {
        currentRotation = allLabels[img].rotation;
      }
    } catch (readError: any) {
      if (readError.code !== 'ENOENT') {
        console.warn(`Error reading existing labels.json for ${folder}:`, readError);
      }
    }

    // 计算新的旋转角度
    const newRotation = (currentRotation + rotation) % 360;
    
    // 删除现有的processed图片，然后基于preprocessed图片和新旋转角度生成新的processed图片
    await resetImageToPreprocessed(folder, img);
    await rotateProcessedImage(folder, img, newRotation);
    
    // 找出图片级别的字段（从第一个框里取，或者用旧数据里的）
    const imageFields = allLabels[img]?.boxes?.[0]?.fields || allLabels[img]?.fields || {};

    // 更新labels.json中的rotation字段，并清除所有实际的标注框，
    // 只保留一个虚拟框用于存放图片级别的字段
    const updatedLabel: ImageLabel = {
      imageName: img,
      boxes: [{
        id: 'image-fields-virtual',
        x: 0, y: 0, w: 0, h: 0,
        fields: imageFields
      }],
      rotation: newRotation
    };
    
    allLabels[img] = updatedLabel;
    
    // 写回更新后的labels
    await fs.writeFile(labelsFilePath, JSON.stringify(allLabels, null, 2));

    res.status(200).json({ message: 'Image rotated successfully.', newRotation });
  } catch (error) {
    console.error(`Failed to rotate image ${img} in ${folder}:`, error);
    res.status(500).json({ error: 'Failed to rotate image' });
  }
});


export default router;
