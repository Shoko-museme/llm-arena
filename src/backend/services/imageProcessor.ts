import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import pLimit from 'p-limit';

const RAW_DATA_PATH = path.resolve(process.cwd(), 'dataset', 'raw-data');
const LABELED_DATA_PATH = path.resolve(process.cwd(), 'dataset', 'labeled-data');
const CONCURRENCY = 4;

const limit = pLimit(CONCURRENCY);

const processingFolders = new Set<string>();

const needResize = (meta: sharp.Metadata) => {
  if (!meta.size || !meta.width || !meta.height) return false;
  return meta.size > 2 * 1024 * 1024 || Math.max(meta.width, meta.height) > 1080;
};

export const processImagesInFolder = async (folder: string): Promise<void> => {
  if (processingFolders.has(folder)) {
    console.log(`Preprocessing already in progress for folder: ${folder}`);
    return;
  }

  processingFolders.add(folder);
  console.log(`Starting preprocessing for folder: ${folder}`);

  try {
    const sourceDir = path.join(RAW_DATA_PATH, folder);
    const destDir = path.join(LABELED_DATA_PATH, folder, 'images');
    await fs.mkdir(destDir, { recursive: true });

    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    const imageFiles = entries.filter(dirent => dirent.isFile() && /\.(jpe?g|png|gif|webp)$/i.test(dirent.name));

    const processingPromises = imageFiles.map(file => limit(async () => {
      const srcPath = path.join(sourceDir, file.name);
      const destPath = path.join(destDir, `${path.parse(file.name).name}.jpg`);

      try {
        const image = sharp(srcPath);
        const metadata = await image.metadata();

        if (needResize(metadata)) {
          let quality = 90;
          let buffer: Buffer;
          do {
            buffer = await image
              .resize({ width: 1080, height: 1080, fit: 'inside', withoutEnlargement: true })
              .jpeg({ quality })
              .toBuffer();
            quality -= 5;
          } while (buffer.length > 2 * 1024 * 1024 && quality >= 75);
          await fs.writeFile(destPath, buffer);
        } else {
          await image.jpeg({ quality: 95 }).toFile(destPath);
        }
        console.log(`Processed: ${file.name}`);
      } catch (err) {
        console.error(`Failed to process ${file.name}:`, err);
      }
    }));
    
    await Promise.all(processingPromises);
    console.log(`Finished preprocessing for folder: ${folder}`);
  } catch (error) {
    console.error(`Error during preprocessing for folder ${folder}:`, error);
  } finally {
    processingFolders.delete(folder);
  }
};
