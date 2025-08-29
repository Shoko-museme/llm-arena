# LLM Arena - Hazard Detection Platform

## Project Overview

LLM Arena is a comprehensive hazard detection and data annotation platform that combines LLM capabilities with a sophisticated image labeling system. The project features:

- **LLM Client Architecture**: Factory-pattern based LLM provider system with multi-modal support
- **Image Annotation Tool**: React-based web interface for bounding box annotation and field labeling
- **Data Processing Pipeline**: Automated image preprocessing, rotation, and export capabilities
- **Multi-Provider Support**: Extensible architecture supporting multiple LLM providers

## Architecture

### High-Level Structure

```
llm-arena/
├── llm_client/          # Python LLM client library
├── src/
│   ├── backend/         # Node.js/Express API server
│   └── frontend/        # React/TypeScript web app
├── dataset/             # Data storage and processing
│   ├── raw-data/        # Original images
│   └── labeled-data/    # Processed and annotated data
└── scripts/             # Utility scripts
```

### LLM Client Architecture

The LLM client follows a factory pattern with abstract base classes:

- **`LLMClient`** (Abstract Base Class): Defines interface for `fast_chat()` method
- **`LLMClientFactory`**: Registry pattern for provider registration and client creation
- **`AiHubMixClient`**: OpenAI-compatible client with multi-modal support
- **Extensible Design**: Easy to add new providers (OpenAI, Anthropic, etc.)

**Key Features:**
- Multi-modal support (text + images)
- Base64 image encoding with MIME type detection
- Factory pattern for provider abstraction
- Environment variable configuration

### Backend API (Node.js/Express)

**Core Endpoints:**
- `GET /api/folders` - List dataset folders
- `GET /api/images/:folder` - List images in folder
- `GET /api/fields/:folder` - Get field definitions
- `POST /api/fields/:folder` - Save field definitions
- `GET /api/label/:folder/:img` - Get image annotations
- `POST /api/label/:folder/:img` - Save image annotations
- `POST /api/initialize/:folder/:img` - Initialize processed image
- `POST /api/rotate/:folder/:img` - Rotate image
- `POST /api/reset/:folder/:img` - Reset image to original
- `GET /api/export/:folder` - Export labeled data as ZIP

**Image Processing Services:**
- Automatic image preprocessing and compression
- Bounding box rendering with SVG overlays
- Image rotation (0°, 90°, 180°, 270°)
- Concurrent processing with p-limit

### Frontend (React/TypeScript)

**Key Components:**
- `AnnotationCanvas` - Konva-based drawing interface
- `AnnotationWorkspace` - Main annotation workspace
- `FieldForm` - Dynamic field definition forms
- `ImageGrid` - Virtualized image browser
- `HomePage` - Main application interface

**State Management:**
- Zustand for lightweight state management
- TypeScript interfaces for type safety
- Responsive design with Tailwind CSS

## Development Commands

### Python Environment (using uv)

```bash
# Install dependencies
uv sync

# Run LLM client tests
uv run test_llm_client.py

# Run specific test
uv run python -c "from llm_client import LLMClientFactory; print(LLMClientFactory.get_supported_providers())"
```

### Node.js Environment

```bash
# Install dependencies
npm install

# Development mode (frontend + backend)
npm run dev

# Frontend only
npm run dev:frontend

# Backend only
npm run dev:backend

# Build for production
npm run build

# Start production server
npm start

# Linting
npm run lint

# Type checking
npx tsc --noEmit
```

### Key Scripts

- `npm run dev` - Start both frontend (port 5173) and backend (port 5174)
- `npm run build` - Build TypeScript and bundle with Vite
- `npm run lint` - ESLint with TypeScript support
- `npm run preview` - Preview production build

## Configuration

### Environment Variables

Create `.env` file in project root:

```env
# LLM Provider Configuration
AIHUBMIX_API_KEY=your_api_key_here
AIHUBMIX_MODEL_NAME=gpt-4o-mini

# Server Configuration (optional)
PORT=5173
BACKEND_PORT=5174
```

### Python Dependencies

Managed through `uv`:
- `openai>=1.102.0` - OpenAI client library
- `dotenv>=0.9.9` - Environment variable management

### Node.js Dependencies

**Core Runtime:**
- `express@^4.19.2` - Web framework
- `react@^18.2.0` - UI framework
- `typescript@^5.2.2` - Type safety

**Image Processing:**
- `sharp@^0.33.5` - High-performance image processing
- `fabric@^5.3.0` - Canvas manipulation
- `konva@^9.3.22` - 2D drawing library

**UI Components:**
- `@radix-ui/*` - Headless UI components
- `tailwindcss@^3.4.4` - Utility-first CSS
- `lucide-react@^0.400.0` - Icon library

## Data Structure

### Dataset Organization

```
dataset/
├── raw-data/
│   ├── gaze-direction/
│   │   ├── fields.json        # Field definitions
│   │   ├── image1.jpg
│   │   └── image2.jpg
│   └── co-detector/
│       └── ...
└── labeled-data/
    └── gaze-direction/
        ├── fields.json        # Copied from raw-data
        ├── labels.json        # Annotation data
        ├── preprocessed-images/  # Compressed originals
        └── processed-images/     # Annotated with boxes
```

### Field Definition Schema

```json
{
  "createdAt": "2025-08-27T09:07:11.101Z",
  "drawBoxesOnImage": false,
  "fields": [
    {
      "key": "direction",
      "label": "视线方向",
      "type": "text"
    }
  ]
}
```

### Annotation Data Schema

```json
{
  "imageName": "example.jpg",
  "boxes": [
    {
      "id": "box-123",
      "x": 0.25,
      "y": 0.30,
      "w": 0.20,
      "h": 0.15,
      "fields": {
        "direction": "left and up"
      }
    }
  ],
  "rotation": 0
}
```

## LLM Client Usage

### Basic Usage

```python
from llm_client import LLMClientFactory

# Create client
client = LLMClientFactory.create_client(
    provider="aihubmix",
    model_name="gpt-4o-mini"
)

# Text-only chat
response = client.fast_chat("Hello, how are you?")

# Multi-modal chat
response = client.fast_chat(
    text_input="Describe this image",
    image_path="/path/to/image.jpg"
)
```

### Adding New Providers

1. Create new client class inheriting from `LLMClient`
2. Implement `fast_chat()` method
3. Register with factory:

```python
class NewProviderClient(LLMClient):
    def fast_chat(self, text_input: str, image_path=None):
        # Implementation
        pass

LLMClientFactory.register_client("newprovider", NewProviderClient)
```

## Image Processing Pipeline

### Automatic Preprocessing

- Images larger than 2MB or 1080px are automatically resized
- JPEG compression with quality optimization
- Concurrent processing with 4 parallel workers
- Temporary file handling for atomic writes

### Annotation Workflow

1. **Initialize**: Raw image → Preprocessed (compressed)
2. **Annotate**: Draw bounding boxes and add field values
3. **Process**: Generate final image with overlays
4. **Export**: Bundle labeled data for download

### Rotation Support

- 90°, 180°, 270° rotation capabilities
- Maintains annotation coordinates
- Preserves field data during rotation
- Automatic box repositioning

## Testing

### LLM Client Tests

```bash
# Run all tests
python test_llm_client.py

# Test coverage includes:
# - Provider registration
# - Text-only conversations
# - Multi-modal conversations
# - Error handling
```

### Frontend Testing

The project uses ESLint and TypeScript for code quality:

```bash
# Lint check
npm run lint

# Type checking
npx tsc --noEmit
```

## Deployment

### Production Build

```bash
# Build frontend
npm run build

# Start production server
npm start
```

### Environment Setup

1. Configure environment variables
2. Install Python dependencies: `uv sync`
3. Install Node.js dependencies: `npm install`
4. Build and start: `npm run build && npm start`

## Key Patterns and Conventions

### Code Organization

- **Separation of Concerns**: Clear frontend/backend separation
- **Type Safety**: TypeScript interfaces throughout
- **Factory Pattern**: Extensible LLM provider system
- **RESTful API**: Standard HTTP methods and status codes

### Error Handling

- Graceful fallbacks for missing files
- Comprehensive error logging
- User-friendly error messages
- Atomic file operations

### Performance Optimizations

- Image compression and resizing
- Concurrent processing
- Virtualized image lists
- Efficient state management

## Future Enhancements

- Additional LLM providers (OpenAI, Anthropic, local models)
- Batch processing capabilities
- Advanced annotation tools (polygons, keypoints)
- Real-time collaboration features
- Enhanced export formats (COCO, Pascal VOC)
- Model training integration