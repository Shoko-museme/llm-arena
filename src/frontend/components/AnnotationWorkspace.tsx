import useAppStore from '../store/useAppStore';
import { Stage, Layer, Image as KonvaImage, Rect, Transformer } from 'react-konva';
import { useRef, useState, useEffect, createRef } from 'react';
import Konva from 'konva';
import { FieldForm } from './FieldForm';
import { BoundingBox, FieldValues, ImageLabel } from '../types';
import { getLabel, saveLabel, resetImage, rotateImage, initializeProcessedImage } from '../services/api';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { MousePointer, Square, RotateCw, RotateCcw, RotateCcw as Reset } from 'lucide-react';
import { useMemo } from 'react';

type Box = BoundingBox;

const AnnotationCanvas = ({
  imageUrl: _imageUrl,
  imageElement,
  boxes,
  setBoxes,
  selectedBoxId: _selectedBoxId,
  setSelectedBoxId,
  drawingMode,
  setDrawingMode,
  onReset,
  onRotate,
}: {
  imageUrl: string;
  imageElement: HTMLImageElement | null;
  boxes: Box[];
  setBoxes: React.Dispatch<React.SetStateAction<Box[]>>;
  selectedBoxId: string | null;
  setSelectedBoxId: React.Dispatch<React.SetStateAction<string | null>>;
  drawingMode: boolean;
  setDrawingMode: React.Dispatch<React.SetStateAction<boolean>>;
  onReset: () => void;
  onRotate: (rotation: number) => Promise<void>;
}) => {
  const { toast } = useToast();
  const [image, setImage] = useState<HTMLImageElement | null>(null);
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
    setImage(imageElement);
  }, [imageElement]);

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

  // Attach transformer to selected box
  useEffect(() => {
    if (_selectedBoxId && !_selectedBoxId.includes('virtual') && transformerRef.current) {
      const selectedNode = boxRefs.current[_selectedBoxId]?.current;
      if (selectedNode) {
        transformerRef.current.nodes([selectedNode]);
        transformerRef.current.getLayer()?.batchDraw();
      }
    } else if (transformerRef.current) {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [_selectedBoxId, boxes]);

  // 键盘事件处理：删除选中的标注框
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (_selectedBoxId && !_selectedBoxId.includes('virtual')) {
          e.preventDefault();
          
          setBoxes(prevBoxes => {
            const newBoxes = prevBoxes.filter(box => box.id !== _selectedBoxId);
            // 如果删除的是最后一个真实框，需要创建一个虚拟框来保留字段
            const remainingRealBoxes = newBoxes.filter(b => b.w > 0 && b.h > 0 && !b.id.includes('virtual'));
            if (remainingRealBoxes.length === 0) {
              const fieldsToKeep = prevBoxes.find(b => b.id === _selectedBoxId)?.fields || {};
              return [{
                id: 'image-fields-virtual',
                x: 0, y: 0, w: 0, h: 0,
                fields: fieldsToKeep
              }];
            }
            return newBoxes;
          });

          setSelectedBoxId(null);
          toast({ title: "Success", description: "标注框已删除" });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [_selectedBoxId, setBoxes, setSelectedBoxId, toast]);

  const { scaledWidth, scaledHeight, imgX, imgY } = useMemo(() => {
    if (!image || !size.width || !size.height) {
      return { scaledWidth: 0, scaledHeight: 0, imgX: 0, imgY: 0 };
    }
    
    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    
    const scale = Math.min(
      (size.width - 20) / naturalWidth,
      (size.height - 20) / naturalHeight
    );
    
    const w = naturalWidth * scale;
    const h = naturalHeight * scale;
    
    return {
      scaledWidth: w,
      scaledHeight: h,
      imgX: (size.width - w) / 2,
      imgY: (size.height - h) / 2,
    };
  }, [image, size]);

  // 简化坐标转换：直接基于当前显示的图片（旋转后的）进行坐标计算
  const stageToRel = (pos: { x: number; y: number }) => {
    if (!scaledWidth || !scaledHeight) return { x: 0, y: 0 };
    return {
      x: (pos.x - imgX) / scaledWidth,
      y: (pos.y - imgY) / scaledHeight,
    };
  };

  const relToStage = (relPos: { x: number; y: number }) => {
    if (!scaledWidth || !scaledHeight) return { x: 0, y: 0 };
    return {
      x: relPos.x * scaledWidth + imgX,
      y: relPos.y * scaledHeight + imgY,
    };
  };

  const handleMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!drawingMode) return;
    
    // Prevent drawing when clicking on a transformer or an existing box
    if (e.target.getParent()?.className === 'Transformer' || e.target.className === 'Rect') {
      return;
    }

    isDrawing.current = true;
    const pos = e.target.getStage()?.getPointerPosition();
    if (!pos) return;
    const { x: relX, y: relY } = stageToRel(pos);

    // 新的box需要附带当前图片级别的fields作为默认值
    const imageFields = boxes.find(b => b.id.includes('virtual'))?.fields || boxes[0]?.fields || {};

    const newBox: Box = {
      id: `box-${Date.now()}`,
      x: relX,
      y: relY,
      w: 0,
      h: 0,
      fields: { ...imageFields }, // 继承字段
    };
    
    // 绘制新标记框时，删除虚拟框并添加新框
    const newBoxes = [...boxes.filter(b => !b.id.includes('virtual')), newBox];

    setBoxes(newBoxes);
    setSelectedBoxId(newBox.id); // 选中新画的框
  };

  const handleMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isDrawing.current) return;
    const stage = e.target.getStage();
    const pos = stage?.getPointerPosition();
    if (!pos) return;
    const { x: relX, y: relY } = stageToRel(pos);

    setBoxes(currentBoxes => {
      const lastBox = currentBoxes[currentBoxes.length - 1];
      if (!lastBox) return currentBoxes;
      const newLastBox = {
        ...lastBox,
        w: relX - lastBox.x,
        h: relY - lastBox.y,
      };
      return [...currentBoxes.slice(0, -1), newLastBox];
    });
  };

  const handleMouseUp = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    setDrawingMode(false); // UX: switch back to view mode after drawing

    setBoxes(currentBoxes => {
      if (currentBoxes.length === 0) return [];
      const lastBox = currentBoxes[currentBoxes.length - 1];

      // Remove box if it's too small (likely a mis-click)
      const minSize = 5 / Math.min(scaledWidth, scaledHeight);
      if (Math.abs(lastBox.w) < minSize || Math.abs(lastBox.h) < minSize) {
        const remainingBoxes = currentBoxes.slice(0, -1);
        const remainingRealBoxes = remainingBoxes.filter(b => b.w > 0 && b.h > 0 && !b.id.includes('virtual'));
        // 如果删除小框后没有真实框了，需要创建虚拟框
        if (remainingRealBoxes.length === 0) {
          const fieldsToKeep = lastBox.fields || {};
          return [{
            id: 'image-fields-virtual',
            x: 0, y: 0, w: 0, h: 0,
            fields: fieldsToKeep
          }];
        }
        return remainingBoxes;
      }

      // Normalize box if drawn with negative width/height
      const normalizedBox = {
        ...lastBox,
        x: lastBox.w < 0 ? lastBox.x + lastBox.w : lastBox.x,
        y: lastBox.h < 0 ? lastBox.y + lastBox.h : lastBox.y,
        w: Math.abs(lastBox.w),
        h: Math.abs(lastBox.h),
      };
      return [...currentBoxes.slice(0, -1), normalizedBox];
    });
  };

  if (!image) {
    return (
      <div ref={containerRef} className="w-full h-full bg-gray-100 flex items-center justify-center">
        <p className="text-gray-500 p-4">Loading image...</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full bg-gray-100 touch-none relative">
      {/* Mode toggle buttons */}
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <Button
          size="sm"
          variant={!drawingMode ? "default" : "outline"}
          onClick={() => {
            setDrawingMode(false);
            setSelectedBoxId(null);
          }}
        >
          <MousePointer className="w-4 h-4 mr-1" />
          View
        </Button>
        <Button
          size="sm"
          variant={drawingMode ? "default" : "outline"}
          onClick={() => setDrawingMode(true)}
        >
          <Square className="w-4 h-4 mr-1" />
          Draw
        </Button>
        {_selectedBoxId && !_selectedBoxId.includes('virtual') && (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => {
              setBoxes(prevBoxes => {
                const newBoxes = prevBoxes.filter(box => box.id !== _selectedBoxId);
                // 如果删除的是最后一个真实框，需要创建一个虚拟框来保留字段
                const remainingRealBoxes = newBoxes.filter(b => b.w > 0 && b.h > 0 && !b.id.includes('virtual'));
                if (remainingRealBoxes.length === 0) {
                  const fieldsToKeep = prevBoxes.find(b => b.id === _selectedBoxId)?.fields || {};
                  return [{
                    id: 'image-fields-virtual',
                    x: 0, y: 0, w: 0, h: 0,
                    fields: fieldsToKeep
                  }];
                }
                return newBoxes;
              });
              setSelectedBoxId(null);
              toast({ title: "Success", description: "标注框已删除" });
            }}
            title="删除选中的标注框"
          >
            Delete
          </Button>
        )}
      </div>

      {/* Reset and Rotation buttons */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        {/* Reset button - 重置图片到preprocessed状态并清除标注 */}
        <Button
          size="sm"
          variant="outline"
          onClick={onReset}
          title="重置图片并清除标注"
        >
          <Reset className="w-4 h-4" />
        </Button>
        
        {/* Rotation buttons - 旋转会清除当前所有标注框 */}
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            // 如果有真实标注框，先提示用户
            const realBoxes = boxes.filter(b => b.w > 0 && b.h > 0 && !b.id.includes('virtual'));
            if (realBoxes.length > 0) {
              if (!confirm("旋转操作会清除当前所有标注框，确定要继续吗？")) {
                return;
              }
            }
            
            await onRotate(270);
          }}
          title="逆时针旋转90度（会清除标注框）"
        >
          <RotateCcw className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            // 如果有真实标注框，先提示用户
            const realBoxes = boxes.filter(b => b.w > 0 && b.h > 0 && !b.id.includes('virtual'));
            if (realBoxes.length > 0) {
              if (!confirm("旋转操作会清除当前所有标注框，确定要继续吗？")) {
                return;
              }
            }
            
            await onRotate(90);
          }}
          title="顺时针旋转90度（会清除标注框）"
        >
          <RotateCw className="w-4 h-4" />
        </Button>
      </div>
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
        style={{ cursor: drawingMode ? 'crosshair' : 'default' }}
      >
        <Layer>
                    <KonvaImage
            image={image}
            x={imgX}
            y={imgY}
            width={scaledWidth}
            height={scaledHeight}
          />
           {boxes.filter(box => box.w > 0 && box.h > 0 && !box.id.includes('virtual')).map((box) => {
             const stagePos = relToStage({ x: box.x, y: box.y });
             const stageSize = relToStage({ x: box.x + box.w, y: box.y + box.h });
             const isSelected = box.id === _selectedBoxId;
             
             return (
               <Rect
                 key={box.id}
                 ref={boxRefs.current[box.id]}
                 x={stagePos.x}
                 y={stagePos.y}
                 width={stageSize.x - stagePos.x}
                 height={stageSize.y - stagePos.y}
                 stroke={isSelected ? "#007BFF" : "red"}
                 strokeWidth={isSelected ? 4 : 2}
                 draggable={!drawingMode}
                 onClick={() => setSelectedBoxId(box.id)}
                 onTap={() => setSelectedBoxId(box.id)}
                 onTransformEnd={(e) => {
                   const node = e.target;
                   const scaleX = node.scaleX();
                   const scaleY = node.scaleY();
                   node.scaleX(1);
                   node.scaleY(1);

                   const newStagePos = { x: node.x(), y: node.y() };
                   const newStageSize = { 
                     x: node.x() + node.width() * scaleX, 
                     y: node.y() + node.height() * scaleY 
                   };
                   
                   const newRelPos = stageToRel(newStagePos);
                   const newRelSize = stageToRel(newStageSize);

                   setBoxes(
                     boxes.map((b) =>
                       b.id === box.id
                         ? {
                             ...b,
                             x: newRelPos.x,
                             y: newRelPos.y,
                             w: newRelSize.x - newRelPos.x,
                             h: newRelSize.y - newRelPos.y,
                           }
                         : b
                     )
                   );
                 }}
                 onDragEnd={(e) => {
                  const node = e.target;
                  const newRelPos = stageToRel({ x: node.x(), y: node.y() });
                  setBoxes(
                    boxes.map((b) =>
                      b.id === box.id
                        ? { ...b, x: newRelPos.x, y: newRelPos.y }
                        : b
                    )
                  );
                }}
               />
             );
           })}
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
    fieldSet,
    navigateToImagePage,
  } = useAppStore();
  const { toast } = useToast();

  const [boxes, setBoxes] = useState<Box[]>([]);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [drawingMode, setDrawingMode] = useState(false);
  const [currentRotation, setCurrentRotation] = useState<number>(0);
  const [imageRefreshKey, setImageRefreshKey] = useState<number>(0);
  
  if (!selectedImage || !currentFolder) return null;

  // 重新加载图片的函数
  const refreshImage = () => {
    setImageRefreshKey(prev => prev + 1);
    setImageElement(null); // 重置图片元素，触发重新加载
  };

  // 处理旋转的函数
  const handleRotate = async (rotation: number) => {
    try {
      const imageNameWithJpg = `${imageNameWithoutExt}.jpg`;
      const result = await rotateImage(currentFolder, imageNameWithJpg, rotation);
      
      const rotationName = rotation === 90 ? "顺时针" : "逆时针";
      toast({ title: "Success", description: `图片已${rotationName}旋转90度到${result.newRotation}度，标注框已清除` });
      
      // 局部刷新图片，让useEffect去处理状态更新
      refreshImage();
    } catch (error) {
      toast({ title: "Error", description: "旋转图片失败", variant: "destructive" });
    }
  };

  const handleReset = async () => {
    try {
      const lastDotIndex = selectedImage.lastIndexOf('.');
      const imageNameWithoutExt = lastDotIndex === -1 ? selectedImage : selectedImage.substring(0, lastDotIndex);
      const imageNameWithJpg = `${imageNameWithoutExt}.jpg`;
      
      await resetImage(currentFolder, imageNameWithJpg);
      
      // 清除前端状态
      setBoxes([]);
      setCurrentRotation(0);
      
      // 重置字段值为默认值
      const defaultValues: FieldValues = {};
      if (fieldSet) {
        fieldSet.fields.forEach(field => {
          if (field.type === 'boolean') {
            defaultValues[field.key] = false;
          } else {
            defaultValues[field.key] = '';
          }
        });
      }
      setBoxes([{
        id: 'image-fields-virtual',
        x: 0, y: 0, w: 0, h: 0,
        fields: defaultValues
      }]);
      
      toast({ title: "Success", description: "图片已重置并清除标注数据" });
      
      // 局部刷新图片
      refreshImage();
    } catch (error) {
      toast({ title: "Error", description: "重置图片失败", variant: "destructive" });
    }
  };

  // This is a ref to the loaded image element to get its natural dimensions
  const [imageElement, setImageElement] = useState<HTMLImageElement | null>(null);
  
  // Construct URL for the processed image
  const lastDotIndex = selectedImage.lastIndexOf('.');
  const imageNameWithoutExt = lastDotIndex === -1 ? selectedImage : selectedImage.substring(0, lastDotIndex);
  const imageUrl = `http://localhost:5174/images-processed/${currentFolder}/processed-images/${imageNameWithoutExt}.jpg?refresh=${imageRefreshKey}`;

  // Effect to initialize processed image and load image element
  useEffect(() => {
    const initializeAndLoadImage = async () => {
      if (!currentFolder || !selectedImage) return;
      
      try {
        const imageNameWithJpg = `${imageNameWithoutExt}.jpg`;
        // 初始化processed图片
        const initResult = await initializeProcessedImage(currentFolder, imageNameWithJpg);
        
        if (initResult.action === 'initialized') {
          console.log('Processed image initialized for', imageNameWithJpg);
          if (initResult.hasExistingLabel) {
            console.log('Restored existing label data on processed image');
          }
        } else {
          console.log('Processed image already exists for', imageNameWithJpg);
        }
        
        // 加载图片元素
        const img = document.createElement('img');
        img.src = imageUrl;
        img.onload = () => setImageElement(img);
        img.onerror = () => {
          console.error('Failed to load processed image:', imageUrl);
          // 可以在这里添加fallback逻辑
        };
      } catch (error) {
        console.error('Failed to initialize processed image:', error);
      }
    };
    
    initializeAndLoadImage();
  }, [imageUrl, currentFolder, selectedImage, imageNameWithoutExt, imageRefreshKey]);

  // Effect to load existing labels when image changes
  useEffect(() => {
    if (!imageElement || !currentFolder || !fieldSet) return;
    
    // 每次图片变化时重置选择状态
    setSelectedBoxId(null);

    const imageNameWithJpg = `${imageNameWithoutExt}.jpg`;
    
    // 定义默认值生成函数
    const getDefaultValues = (): FieldValues => {
      const defaultValues: FieldValues = {};
      if (fieldSet) {
        fieldSet.fields.forEach(field => {
          defaultValues[field.key] = field.type === 'boolean' ? false : '';
        });
      }
      return defaultValues;
    };

    getLabel(currentFolder, imageNameWithJpg).then(label => {
      // 重置选择状态
      setSelectedBoxId(null);
      
      if (label && label.boxes && label.boxes.length > 0) {
        setBoxes(label.boxes);
        setCurrentRotation(label.rotation || 0);
      } else {
        // 没有标签或box，创建一个虚拟box来存储字段
        setBoxes([{
          id: 'image-fields-virtual',
          x: 0, y: 0, w: 0, h: 0,
          fields: getDefaultValues()
        }]);
        setCurrentRotation(0);
      }
    });
  }, [currentFolder, selectedImage, imageElement, imageNameWithoutExt, fieldSet]);


  const handleFieldsChange = (newFields: FieldValues) => {
    setBoxes(prevBoxes => {
      // 找到要更新的box的索引
      // 如果有选中的box，就用它；否则，默认是第一个box（图片级别）
      const targetId = selectedBoxId || (prevBoxes.length > 0 ? prevBoxes[0].id : null);
      if (!targetId) return prevBoxes;
      
      const boxIndex = prevBoxes.findIndex(b => b.id === targetId);
      if (boxIndex === -1) return prevBoxes;

      // 创建新的box数组并更新目标box的fields
      const newBoxes = [...prevBoxes];
      newBoxes[boxIndex] = {
        ...newBoxes[boxIndex],
        fields: newFields,
      };
      
      return newBoxes;
    });
  };

  const handleSave = async () => {
    if (!imageElement) {
      toast({ title: "Error", description: "Image not loaded yet.", variant: "destructive" });
      return;
    }
    setIsSaving(true);

    const clamp = (num: number, min: number, max: number) => Math.min(Math.max(num, min), max);
    
    // 定义默认值生成函数
    const getDefaultValues = (): FieldValues => {
      const defaultValues: FieldValues = {};
      if (fieldSet) {
        fieldSet.fields.forEach(field => {
          defaultValues[field.key] = field.type === 'boolean' ? false : '';
        });
      }
      return defaultValues;
    };

    const finalBoxes: BoundingBox[] = boxes
      // 过滤掉虚拟box（如果有实际的box的话）
      .filter(box => {
        if (boxes.some(b => b.w > 0 && b.h > 0)) {
          return box.w > 0 && box.h > 0;
        }
        return true; // 如果只有虚拟box，保留它
      })
      .map(box => {
        const clampedX = clamp(box.x, 0, 1);
        const clampedY = clamp(box.y, 0, 1);

        // 确保box有完整的字段值，合并已有字段与默认值
        const defaultFields = getDefaultValues();
        const actualFields = box.fields || {};
        const mergedFields: FieldValues = {};
        
        // 使用默认值作为基础，然后用实际值覆盖
        Object.keys(defaultFields).forEach(key => {
          mergedFields[key] = actualFields[key] !== undefined ? actualFields[key] : defaultFields[key];
        });

        return {
          ...box,
          x: clampedX,
          y: clampedY,
          w: clamp(box.w, 0, 1 - clampedX),
          h: clamp(box.h, 0, 1 - clampedY),
          fields: mergedFields,
        };
    });

    // 如果处理后没有box了（例如，过滤掉了唯一的虚拟box），需要确保至少有一个
    if (finalBoxes.length === 0 && boxes.length > 0) {
      // 创建一个带有默认字段值的虚拟box
      const defaultFields = getDefaultValues();
      finalBoxes.push({
        id: 'image-fields-virtual',
        x: 0, y: 0, w: 0, h: 0,
        fields: defaultFields
      });
    }
    
    const imageNameWithJpg = `${imageNameWithoutExt}.jpg`;
    const label: ImageLabel = {
      imageName: imageNameWithJpg,
      boxes: finalBoxes,
      rotation: currentRotation,
    };

    try {
      await saveLabel(currentFolder, imageNameWithJpg, label);
      toast({ title: "Success", description: "Label saved." });

      // Auto-advance to next image
      const currentIndex = images.indexOf(selectedImage);
      if (currentIndex > -1 && currentIndex < images.length - 1) {
        const nextImage = images[currentIndex + 1];
        setSelectedImage(nextImage);
        // Navigate to the page containing the next image
        navigateToImagePage(nextImage);
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

  // 确定当前用于 FieldForm 的字段值
  const activeFields = useMemo(() => {
    if (!boxes || boxes.length === 0) return {};
    const targetBox = boxes.find(b => b.id === selectedBoxId);
    // 如果有选中的box，用它的fields；否则用第一个box的（通常是图片级）
    return targetBox?.fields || boxes[0]?.fields || {};
  }, [boxes, selectedBoxId]);


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
              imageElement={imageElement}
              boxes={boxes}
              setBoxes={setBoxes}
              selectedBoxId={selectedBoxId}
              setSelectedBoxId={setSelectedBoxId}
              drawingMode={drawingMode}
              setDrawingMode={setDrawingMode}
              onReset={handleReset}
              onRotate={handleRotate}
            />
          </div>
          <div>
            <FieldForm initialValues={activeFields} onFieldsChange={handleFieldsChange} onSave={handleSave} isSaving={isSaving} />
          </div>
        </div>
      </div>
    </div>
  );
};
