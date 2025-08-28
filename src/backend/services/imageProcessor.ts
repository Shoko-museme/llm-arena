import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import pLimit from 'p-limit';

const RAW_DATA_PATH = path.resolve(process.cwd(), 'dataset', 'raw-data');
const LABELED_DATA_PATH = path.resolve(process.cwd(), 'dataset', 'labeled-data');
const CONCURRENCY = 4;

const limit = pLimit(CONCURRENCY);

const processingFolders = new Set<string>();

const needResize = (meta: sharp.Metadata, fileSize: number) => {
  if (!meta.width || !meta.height) return false;
  return fileSize > 2 * 1024 * 1024 || Math.max(meta.width, meta.height) > 1080;
};

export const processImagesInFolder = async (folder: string): Promise<void> => {
  if (processingFolders.has(folder)) {
    return;
  }

  // Double-check if another process has started since the initial check
  if (processingFolders.has(folder)) {
    return;
  }
  
  processingFolders.add(folder);

  try {
    const sourceDir = path.join(RAW_DATA_PATH, folder);
    const destDir = path.join(LABELED_DATA_PATH, folder, 'preprocessed-images');
    await fs.mkdir(destDir, { recursive: true });

    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    const imageFiles = entries.filter(dirent => dirent.isFile() && /\.(jpe?g|png|gif|webp)$/i.test(dirent.name));

    const processingPromises = imageFiles.map(file => limit(async () => {
      const srcPath = path.join(sourceDir, file.name);
      const destPath = path.join(destDir, `${path.parse(file.name).name}.jpg`);

      try {
        const stats = await fs.stat(srcPath);
        const image = sharp(srcPath);
        const metadata = await image.metadata();

        if (needResize(metadata, stats.size)) {

          const resizedImage = image.resize({ 
            width: 1920, 
            height: 1920, 
            fit: 'inside', 
            withoutEnlargement: true 
          });

          let quality = 90;
          let buffer: Buffer;

          do {
            buffer = await resizedImage.jpeg({ quality }).toBuffer();

            quality -= 5;
          } while (buffer.length > 2 * 1024 * 1024 && quality >= 50);

          if (buffer.length > 2 * 1024 * 1024) {
            console.warn(`[Image Processing] Warning: ${path.basename(destPath)} is still larger than 2MB (${(buffer.length / 1024 / 1024).toFixed(2)} MB) after compression.`);
          }

          const tmpPath = destPath + '.tmp';
          await fs.writeFile(tmpPath, buffer);
          await fs.rename(tmpPath, destPath);
        } else {

          const tmpPath2 = destPath + '.tmp';
          await image.jpeg({ quality: 95 }).toFile(tmpPath2);

          await fs.rename(tmpPath2, destPath);
        }

      } catch (err) {
        console.error(`[Image Processing] Error processing ${file.name}:`, err);
      }
    }));
    
    await Promise.all(processingPromises);

  } catch (error) {
    console.error(`[Image Processing] Critical error during preprocessing for folder ${folder}:`, error);
  } finally {
    processingFolders.delete(folder);

  }
};

export interface BoundingBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fields: Record<string, any>;
}

export interface ImageLabel {
  imageName: string;
  boxes: BoundingBox[];
  rotation?: number; // 旋转角度：0, 90, 180, 270
}

// 初始化processed图片：从preprocessed-images复制到processed-images
export const initializeProcessedImage = async (
  folder: string,
  imageName: string,
  rotation: number = 0
): Promise<void> => {
  try {
    const preprocessedImagePath = path.join(LABELED_DATA_PATH, folder, 'preprocessed-images', imageName);
    const processedImagePath = path.join(LABELED_DATA_PATH, folder, 'processed-images', imageName);
    
    // 确保processed-images文件夹存在
    await fs.mkdir(path.join(LABELED_DATA_PATH, folder, 'processed-images'), { recursive: true });
    
    // 读取preprocessed图片
    let image = sharp(preprocessedImagePath);
    
    // 如果有旋转角度，应用旋转
    if (rotation && rotation !== 0) {
      switch (rotation) {
        case 90:
          image = image.rotate(90);
          break;
        case 180:
          image = image.rotate(180);
          break;
        case 270:
          image = image.rotate(270);
          break;
        default:
          break; // 无效的旋转角度，不应用旋转
      }
    }
    
    const outputBuffer = await image
      .jpeg({ quality: 95 })
      .toBuffer();
    
    // 写入到processed-images
    await fs.writeFile(processedImagePath, outputBuffer);
    
    console.log(`[Initialize Processed] Created processed image ${imageName} with rotation ${rotation}`);
  } catch (error) {
    console.error(`[Initialize Processed] Error initializing ${imageName}:`, error);
    throw error;
  }
};

// 基于preprocessed图片和旋转角度生成新的processed图片
export const rotateProcessedImage = async (
  folder: string,
  imageName: string,
  newRotation: number
): Promise<void> => {
  try {
    const preprocessedImagePath = path.join(LABELED_DATA_PATH, folder, 'preprocessed-images', imageName);
    const processedImagePath = path.join(LABELED_DATA_PATH, folder, 'processed-images', imageName);
    
    // 确保processed-images文件夹存在
    await fs.mkdir(path.join(LABELED_DATA_PATH, folder, 'processed-images'), { recursive: true });
    
    // 从preprocessed图片开始，应用新的旋转角度
    let image = sharp(preprocessedImagePath);
    
    if (newRotation && newRotation !== 0) {
      switch (newRotation) {
        case 90:
          image = image.rotate(90);
          break;
        case 180:
          image = image.rotate(180);
          break;
        case 270:
          image = image.rotate(270);
          break;
        default:
          break; // 无效的旋转角度
      }
    }
    
    const outputBuffer = await image
      .jpeg({ quality: 95 })
      .toBuffer();
    
    // 写入到processed-images
    await fs.writeFile(processedImagePath, outputBuffer);
    
    console.log(`[Rotate Processed] Successfully rotated ${imageName} to ${newRotation} degrees`);
  } catch (error) {
    console.error(`[Rotate Processed] Error rotating ${imageName}:`, error);
    throw error;
  }
};

export const drawBoxesOnImage = async (
  folder: string, 
  imageName: string, 
  boxes: BoundingBox[],
  rotation: number = 0
): Promise<void> => {
  try {
    const preprocessedImagePath = path.join(LABELED_DATA_PATH, folder, 'preprocessed-images', imageName);
    const processedImagePath = path.join(LABELED_DATA_PATH, folder, 'processed-images', imageName);
    
    // 确保processed-images文件夹存在
    await fs.mkdir(path.join(LABELED_DATA_PATH, folder, 'processed-images'), { recursive: true });
    
    // 从preprocessed图片开始，应用旋转
    let image = sharp(preprocessedImagePath);
    
    // 如果有旋转角度，应用旋转
    if (rotation && rotation !== 0) {
      switch (rotation) {
        case 90:
          image = image.rotate(90);
          break;
        case 180:
          image = image.rotate(180);
          break;
        case 270:
          image = image.rotate(270);
          break;
        default:
          break; // 无效的旋转角度，不应用旋转
      }
    }
    
    // 获取旋转后的真实尺寸
    const rotatedBuffer = await image.toBuffer();
    const metadata = await sharp(rotatedBuffer).metadata();
    image = sharp(rotatedBuffer); // 重新创建sharp实例以便后续操作
    
    if (!metadata.width || !metadata.height) {
      throw new Error('Unable to get image dimensions');
    }

    if (boxes.length === 0) {
      // 如果没有框，保存带旋转的图片到processed文件夹
      const outputBuffer = await image
        .jpeg({ quality: 95 })
        .toBuffer();
      await fs.writeFile(processedImagePath, outputBuffer);
      console.log(`[Save Image] Saved ${imageName} to processed-images with rotation ${rotation} (no boxes)`);
      return;
    }

    // Create SVG overlay with bounding boxes
    // 注意：标注框坐标是基于旋转后的图片尺寸
    const svgElements = boxes.map(box => {
      const x = Math.round(box.x * metadata.width!);
      const y = Math.round(box.y * metadata.height!);
      const width = Math.round(box.w * metadata.width!);
      const height = Math.round(box.h * metadata.height!);
      
      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" 
                    fill="none" stroke="red" stroke-width="3" opacity="0.8"/>`;
    }).join('\n');

    const svg = `
      <svg width="${metadata.width}" height="${metadata.height}">
        ${svgElements}
      </svg>
    `;

    // Composite the SVG overlay onto the image
    const svgBuffer = Buffer.from(svg);
    const outputBuffer = await image
      .composite([{ input: svgBuffer, top: 0, left: 0 }])
      .jpeg({ quality: 95 })
      .toBuffer();

    // Write the image with boxes drawn on it to processed-images
    await fs.writeFile(processedImagePath, outputBuffer);
    
    console.log(`[Draw Boxes] Successfully drew ${boxes.length} boxes on ${imageName} with rotation ${rotation} and saved to processed-images`);
  } catch (error) {
    console.error(`[Draw Boxes] Error drawing boxes on ${imageName}:`, error);
    throw error;
  }
};

// 重置图片：删除processed-images中的图片（如果存在）
// 如果processed-images中不存在该图片，则不做任何操作
export const resetImageToPreprocessed = async (
  folder: string, 
  imageName: string
): Promise<void> => {
  try {
    const processedImagePath = path.join(LABELED_DATA_PATH, folder, 'processed-images', imageName);
    
    // 检查processed-images中是否存在该图片
    try {
      await fs.access(processedImagePath);
      // 如果存在，删除processed-images中的图片
      await fs.unlink(processedImagePath);
      console.log(`[Reset Image] Deleted ${imageName} from processed-images`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
      // 文件不存在，说明图片未被标记过，这是正常情况
      console.log(`[Reset Image] ${imageName} has no processed version (image not labeled yet)`);
    }
  } catch (error) {
    console.error(`[Reset Image] Error resetting ${imageName}:`, error);
    throw error;
  }
};
