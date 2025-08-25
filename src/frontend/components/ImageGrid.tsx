import { useEffect, useState } from 'react';
import useAppStore from '../store/useAppStore';
import { getImages } from '../services/api';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import path from 'path';

export const ImageGrid = () => {
  const { currentFolder, images, setImages, setSelectedImage } = useAppStore();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (currentFolder) {
      const fetchImages = async () => {
        setIsLoading(true);
        try {
          const imageList = await getImages(currentFolder);
          setImages(imageList);
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

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
      {images.map((image) => {
        const imageNameWithoutExt = path.parse(image).name;
        const thumbnailUrl = `http://localhost:5174/images-processed/${currentFolder}/images/${imageNameWithoutExt}.jpg`;
        
        return (
          <div 
            key={image} 
            className="border rounded-lg p-2 text-center cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => setSelectedImage(image)}
          >
            <img 
              src={thumbnailUrl} 
              alt={image} 
              className="w-full h-24 object-cover bg-gray-200 rounded mb-2" 
              loading="lazy"
            />
            <p className="text-sm truncate">{image}</p>
          </div>
        );
      })}
    </div>
  );
};
