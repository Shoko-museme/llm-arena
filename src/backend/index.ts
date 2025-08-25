import express from 'express';
import cors from 'cors';
import dataRoutes from './routes/data';
import path from 'path';

const PORT = process.env.BACKEND_PORT || 5174;

const app = express();
app.use(cors());
app.use(express.json());

app.use(dataRoutes);

// Serve static images from the raw-data directory
const RAW_DATA_PATH = path.resolve(process.cwd(), 'dataset', 'raw-data');
app.use('/images-raw', express.static(RAW_DATA_PATH));

// Serve preprocessed images from the labeled-data directory
const LABELED_DATA_PATH = path.resolve(process.cwd(), 'dataset', 'labeled-data');
app.use('/images-processed', express.static(path.join(LABELED_DATA_PATH)));


app.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
});
