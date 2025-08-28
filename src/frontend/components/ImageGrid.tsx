import { useEffect, useState } from 'react';
import useAppStore from '../store/useAppStore';
import { getImages } from '../services/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const PAGE_SIZE_OPTIONS = [12, 24, 48, 96];

export const ImageGrid = () => {
  const { 
    currentFolder, 
    images, 
    setImages, 
    setSelectedImage, 
    selectedImage,
    currentPage, 
    pageSize, 
    setCurrentPage, 
    setPageSize,
    navigateToImagePage 
  } = useAppStore();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [pageInput, setPageInput] = useState('');

  useEffect(() => {
    if (currentFolder) {
      const fetchImages = async () => {
        setIsLoading(true);
        try {
          const imageList = await getImages(currentFolder);
          setImages(imageList); // This will automatically reset to first page in store
        } catch (error) {
          toast({
            title: 'Error fetching images',
            description: `Could not load images for ${currentFolder}.`,
            variant: 'destructive',
          });
        } finally {
          setIsLoading(false);
        }
      };
      fetchImages();
    }
  }, [currentFolder, setImages, toast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
        <p className="ml-4 text-muted-foreground">Loading images...</p>
      </div>
    );
  }

  if (!currentFolder) {
    return null;
  }

  if (images.length === 0) {
    return <p className="text-center text-muted-foreground p-8">No images found in this folder.</p>;
  }

  // 计算分页相关数据
  const totalPages = Math.ceil(images.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const currentImages = images.slice(startIndex, endIndex);

  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handleFirstPage = () => {
    setCurrentPage(1);
  };

  const handleLastPage = () => {
    setCurrentPage(totalPages);
  };

  const handlePageSizeChange = (newPageSize: string) => {
    const size = parseInt(newPageSize);
    setPageSize(size); // This will automatically reset to first page in store
  };

  const handlePageJump = () => {
    const pageNum = parseInt(pageInput);
    if (pageNum >= 1 && pageNum <= totalPages) {
      setCurrentPage(pageNum);
      setPageInput('');
    }
  };

  const handlePageInputKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handlePageJump();
    }
  };

  return (
    <div className="space-y-4">
      {/* 分页信息和控制 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="text-sm text-muted-foreground">
            Showing {startIndex + 1}-{Math.min(endIndex, images.length)} of {images.length} images
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">Per page:</span>
            <Select value={pageSize.toString()} onValueChange={handlePageSizeChange}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={size.toString()}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleFirstPage}
            disabled={currentPage === 1}
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrevPage}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={pageInput}
              onChange={(e) => setPageInput(e.target.value)}
              onKeyPress={handlePageInputKeyPress}
              placeholder={currentPage.toString()}
              className="w-16 text-center"
              min="1"
              max={totalPages}
            />
            <span className="text-sm">of {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePageJump}
              disabled={!pageInput || parseInt(pageInput) < 1 || parseInt(pageInput) > totalPages}
            >
              Go
            </Button>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleNextPage}
            disabled={currentPage === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleLastPage}
            disabled={currentPage === totalPages}
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 图片网格 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
        {currentImages.map((image) => {
          const lastDotIndex = image.lastIndexOf('.');
          const imageNameWithoutExt = lastDotIndex === -1 ? image : image.substring(0, lastDotIndex);
          
          // 优先显示processed-images中的图片（已标记），降级到preprocessed-images（未标记）
          const processedImageUrl = `http://localhost:5174/images-processed/${currentFolder}/processed-images/${imageNameWithoutExt}.jpg`;
          const preprocessedImageUrl = `http://localhost:5174/images-preprocessed/${currentFolder}/preprocessed-images/${imageNameWithoutExt}.jpg`;
          
          const isSelected = selectedImage === image;
          
          return (
            <div 
              key={image} 
              className={`border rounded-lg p-2 text-center cursor-pointer hover:shadow-lg transition-all ${
                isSelected 
                  ? 'border-sky-500 bg-sky-50 shadow-lg ring-2 ring-sky-200' 
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => {
                setSelectedImage(image);
                navigateToImagePage(image);
              }}
            >
              <img 
                src={processedImageUrl} 
                alt={image} 
                className="w-full h-24 object-cover bg-gray-200 rounded mb-2" 
                loading="lazy"
                onError={(e) => {
                  // 如果processed-images中的图片加载失败，尝试加载preprocessed-images中的图片
                  if (e.currentTarget.src === processedImageUrl) {
                    e.currentTarget.src = preprocessedImageUrl;
                  } else {
                    console.error('Both processed and preprocessed image load failed:', image);
                    e.currentTarget.style.background = '#ff0000';
                  }
                }}
              />
              <p className={`text-sm truncate ${isSelected ? 'font-medium text-sky-700' : ''}`}>
                {image}
              </p>
            </div>
          );
        })}
      </div>

      {/* 底部分页控制（简化版） */}
      {totalPages > 1 && (
        <div className="flex justify-center">
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleFirstPage}
              disabled={currentPage === 1}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrevPage}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <span className="text-sm px-4">
              Page {currentPage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleLastPage}
              disabled={currentPage === totalPages}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
