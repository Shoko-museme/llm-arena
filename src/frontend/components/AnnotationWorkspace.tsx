import useAppStore from '../store/useAppStore';
import { Stage, Layer, Image as KonvaImage, Rect, Transformer } from 'react-konva';
import useImage from 'use-image';
import { useRef, useState, useEffect, createRef } from 'react';
import Konva from 'konva';
import { FieldForm } from './FieldForm';
import { BoundingBox, FieldValues, ImageLabel } from '../types';
import { getLabel, saveLabel } from '../services/api';
import { useToast } from '@/hooks/use-toast';
import path from 'path';

type Box = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

const AnnotationCanvas = ({ imageUrl, boxes, setBoxes, selectedBoxId, setSelectedBoxId }: {
  imageUrl: string;
  boxes: Box[];
  setBoxes: React.Dispatch<React.SetStateAction<Box[]>>;
  selectedBoxId: string | null;
  setSelectedBoxId: React.Dispatch<React.SetStateAction<string | null>>;
}) => {
  const [image, imageLoadError] = useImage(imageUrl);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  const isDrawing = useRef(false);
  
  const transformerRef = useRef<Konva.Transformer>(null);
  const boxRefs = useRef<any>({});
  boxRefs.current = boxes.reduce((acc, box) => {
    acc[box.id] = acc[box.id] || createRef();
    return acc;
  }, {} as { [key: string]: React.RefObject<Konva.Rect> });


  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  useEffect(() => {
    if (transformerRef.current) {
      if (selectedBoxId) {
        const selectedNode = boxRefs.current[selectedBoxId]?.current;
        if (selectedNode) {
          transformerRef.current.nodes([selectedNode]);
        }
      } else {
        transformerRef.current.nodes([]);
      }
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selectedBoxId]);


  const imageSize = () => {
    if (!image) return { width: 0, height: 0, x: 0, y: 0 };
    const scale = Math.min(
      (size.width - 20) / image.width,
      (size.height - 20) / image.height
    );
    const w = image.width * scale;
    const h = image.height * scale;
    return {
      width: w,
      height: h,
      x: (size.width - w) / 2,
      y: (size.height - h) / 2,
    };
  };

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (e.target !== e.currentTarget) return;

    isDrawing.current = true;
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;
    const { x: imgX, y: imgY } = imageSize();

    const newBox: Box = {
      id: `box-${Date.now()}`,
      x: pos.x - imgX,
      y: pos.y - imgY,
      width: 0,
      height: 0,
    };
    setBoxes([...boxes, newBox]);
    setSelectedBoxId(null);
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isDrawing.current) return;
    const stage = e.target.getStage();
    const pos = stage?.getPointerPosition();
    if (!pos) return;
    const { x: imgX, y: imgY } = imageSize();

    setBoxes((currentBoxes) => {
      const lastBox = currentBoxes[currentBoxes.length - 1];
      const newLastBox = {
        ...lastBox,
        width: pos.x - imgX - lastBox.x,
        height: pos.y - imgY - lastBox.y,
      };
      return [...currentBoxes.slice(0, -1), newLastBox];
    });
  };

  const handleMouseUp = () => {
    isDrawing.current = false;
  };

  return (
    <div ref={containerRef} className="w-full h-full bg-gray-100 touch-none">
      {imageLoadError && <p className="text-red-500 p-4">Error loading image. Check backend connection.</p>}
      <Stage
        width={size.width}
        height={size.height}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            setSelectedBoxId(null);
          }
        }}
      >
        <Layer>
          <KonvaImage image={image} {...imageSize()} />
          {boxes.map((box) => (
            <Rect
              key={box.id}
              ref={boxRefs.current[box.id]}
              x={box.x + imageSize().x}
              y={box.y + imageSize().y}
              width={box.width}
              height={box.height}
              stroke="red"
              strokeWidth={2}
              onClick={() => setSelectedBoxId(box.id)}
              onTap={() => setSelectedBoxId(box.id)}
              onTransformEnd={(e) => {
                const node = e.target;
                const scaleX = node.scaleX();
                const scaleY = node.scaleY();
                node.scaleX(1);
                node.scaleY(1);

                setBoxes(
                  boxes.map((b) =>
                    b.id === box.id
                      ? {
                          ...b,
                          x: node.x() - imageSize().x,
                          y: node.y() - imageSize().y,
                          width: node.width() * scaleX,
                          height: node.height() * scaleY,
                        }
                      : b
                  )
                );
              }}
            />
          ))}
          <Transformer ref={transformerRef} />
        </Layer>
      </Stage>
    </div>
  );
};


export const AnnotationWorkspace = () => {
  const {
    selectedImage,
    setSelectedImage,
    currentFolder,
    images, // Get images from store
  } = useAppStore();
  const { toast } = useToast();

  const [boxes, setBoxes] = useState<Box[]>([]);
  const [fieldValues, setFieldValues] = useState<FieldValues>({});
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  if (!selectedImage || !currentFolder) return null;

  // This is a ref to the loaded image element to get its natural dimensions
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  
  // Construct URL for the preprocessed image
  const imageNameWithoutExt = path.parse(selectedImage).name;
  const imageUrl = `http://localhost:5174/images-processed/${currentFolder}/images/${imageNameWithoutExt}.jpg`;

  // Effect to load the image element and get its dimensions
  useEffect(() => {
    const img = document.createElement('img');
    img.src = imageUrl;
    img.onload = () => setImageElement(img);
  }, [imageUrl]);

  // Effect to load existing labels when image changes
  useEffect(() => {
    if (!imageElement) return;

    getLabel(currentFolder, selectedImage).then(label => {
      if (label) {
        setFieldValues(label.fields);
        const loadedBoxes = label.boxes?.map(b => ({
          id: b.id,
          x: b.x * imageElement.naturalWidth,
          y: b.y * imageElement.naturalHeight,
          width: b.w * imageElement.naturalWidth,
          height: b.h * imageElement.naturalHeight,
        })) || [];
        setBoxes(loadedBoxes);
      } else {
        // Reset for new image
        setFieldValues({});
        setBoxes([]);
      }
    });
  }, [currentFolder, selectedImage, imageElement]);


  const handleSave = async (newFieldValues: FieldValues) => {
    if (!imageElement) {
      toast({ title: "Error", description: "Image not loaded yet.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    const relativeBoxes: BoundingBox[] = boxes.map(box => ({
      id: box.id,
      x: box.x / imageElement.naturalWidth,
      y: box.y / imageElement.naturalHeight,
      w: box.width / imageElement.naturalWidth,
      h: box.height / imageElement.naturalHeight,
    }));

    const label: ImageLabel = {
      imageName: selectedImage,
      boxes: relativeBoxes,
      fields: newFieldValues,
    };

    try {
      await saveLabel(currentFolder, selectedImage, label);
      toast({ title: "Success", description: "Label saved." });

      // Auto-advance to next image
      const currentIndex = images.indexOf(selectedImage);
      if (currentIndex > -1 && currentIndex < images.length - 1) {
        setSelectedImage(images[currentIndex + 1]);
      } else {
        // Last image, close workspace
        setSelectedImage(undefined);
        toast({ title: "Complete", description: "All images in this folder have been processed." });
      }

    } catch (error) {
      toast({ title: "Error", description: "Failed to save label.", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4">
      <div className="bg-white p-6 rounded-lg shadow-2xl w-full h-full flex flex-col">
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
          <h2 className="text-2xl font-bold">Annotating: <span className="font-mono text-emerald-600">{selectedImage}</span></h2>
          <button
            onClick={() => setSelectedImage(undefined)}
            className="text-2xl font-bold text-gray-500 hover:text-gray-800"
          >
            &times;
          </button>
        </div>
        <div className="flex-grow min-h-0 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <AnnotationCanvas 
              imageUrl={imageUrl}
              boxes={boxes}
              setBoxes={setBoxes}
              selectedBoxId={selectedBoxId}
              setSelectedBoxId={setSelectedBoxId}
            />
          </div>
          <div>
            <FieldForm initialValues={fieldValues} onSave={handleSave} isSaving={isSaving} />
          </div>
        </div>
      </div>
    </div>
  );
};
