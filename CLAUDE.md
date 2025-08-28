# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**LLM Arena** is an image labeling tool designed for creating and managing annotated datasets. It provides a web-based interface for:
- Image annotation with bounding boxes
- Custom field definitions for annotations
- Dataset management and export
- Image preprocessing and rotation

## Architecture

The project is a **full-stack TypeScript application** with:
- **Frontend**: React + Vite + Tailwind CSS + Zustand
- **Backend**: Express.js with TypeScript
- **Image Processing**: Sharp library for high-performance image manipulation
- **Data Storage**: File-based JSON storage

### Directory Structure

```
src/
├── backend/               # Express.js backend
│   ├── index.ts          # Main server entry
│   ├── routes/data.ts    # API endpoints for data management
│   └── services/         # Business logic
│       └── imageProcessor.ts  # Image processing with Sharp
└── frontend/             # React frontend
    ├── components/       # Reusable UI components
    ├── pages/HomePage.tsx # Main application page
    ├── services/api.ts   # API client
    ├── store/useAppStore.ts # Zustand state management
    └── types/index.ts    # TypeScript type definitions

dataset/
├── raw-data/            # Original uploaded images
│   └── [folder]/        # Organized by dataset folders
│       ├── fields.json  # Field definitions for annotations
│       └── images...    # Source images
└── labeled-data/        # Processed and annotated data
    └── [folder]/        # Corresponding output folders
        ├── preprocessed-images/  # Resized/compressed images
        ├── processed-images/     # Images with annotations drawn
        └── labels.json           # Annotation data
```

## Development Commands

### Starting the Application
```bash
npm run dev          # Start both frontend and backend in development mode
npm run dev:backend  # Start only backend on port 5174
npm run preview      # Preview production build locally
npm start            # Run production build
```

### Build Commands
```bash
npm run build        # Build for production
npm run lint         # Run ESLint on TypeScript files
```

### Environment Configuration
- **Frontend Port**: 5173 (configurable via PORT env var)
- **Backend Port**: 5174 (configurable via BACKEND_PORT env var)
- **Proxy**: Vite proxy forwards /api to backend

## Key API Endpoints

### Data Management
- `GET /api/folders` - List dataset folders
- `GET /api/images/:folder` - List images in folder
- `GET /api/fields/:folder` - Get field definitions
- `POST /api/fields/:folder` - Save field definitions

### Annotation Management
- `GET /api/label/:folder/:image` - Get image annotations
- `POST /api/label/:folder/:image` - Save image annotations
- `GET /api/labels/:folder` - Get all annotations for folder
- `POST /api/export/:folder` - Export annotated dataset as ZIP

### Image Operations
- `POST /api/reset/:folder/:image` - Reset image to default state
- `POST /api/initialize/:folder/:image` - Initialize processed image
- `POST /api/rotate/:folder/:image` - Rotate image by 90/180/270 degrees

### Static File Serving
- `/images-raw/:path` - Raw images from dataset/raw-data
- `/images-preprocessed/:path` - Preprocessed images
- `/images-processed/:path` - Images with annotations

## Core Data Types

### Field System
```typescript
interface Field {
  key: string;           // Machine-readable identifier
  label: string;         // Human-readable label
  type: 'text' | 'boolean' | 'select';
  options?: string[];    // For select type
}

interface FieldSet {
  createdAt: string;
  drawBoxesOnImage: boolean;
  fields: Field[];
}
```

### Annotation System
```typescript
interface BoundingBox {
  id: string;
  x: number;      // Relative position (0-1)
  y: number;      // Relative position (0-1)
  w: number;      // Relative width (0-1)
  h: number;      // Relative height (0-1)
  fields: Record<string, any>; // Annotation values
}

interface ImageLabel {
  imageName: string;
  boxes: BoundingBox[];
  rotation?: number; // 0, 90, 180, 270
}
```

## Image Processing Pipeline

1. **Preprocessing**: Images are resized to max 1920px, compressed to <2MB
2. **Processing**: Annotations are drawn as red bounding boxes
3. **Rotation**: Images can be rotated in 90° increments
4. **Reset**: Images can be reset to preprocessed state

## Key Components

### Frontend State Management
- **Zustand store**: Global state for selected folder, images, field sets
- **React Window**: Virtualized scrolling for large image grids
- **Fabric.js**: Canvas-based annotation drawing (not used, uses Konva)
- **Konva.js**: Canvas-based annotation system

### Backend Services
- **ImageProcessor**: Handles all image transformations with Sharp
- **Concurrent Processing**: Limits to 4 concurrent image operations
- **Compression**: Progressive JPEG compression for optimal file sizes

## Deployment Notes

- **Build Output**: `dist/` contains both frontend and backend bundles
- **Static Assets**: Images served from dataset directory (not bundled)
- **File System**: Requires write access to dataset/labeled-data directory
- **Memory**: Image processing is memory-intensive; monitor for large datasets