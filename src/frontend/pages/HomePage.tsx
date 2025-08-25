import { useEffect, useState } from 'react';
import { getFolders, getFieldSet, saveFieldSet, getLabelList } from '../services/api';
import { FieldSet } from '../types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FieldSetEditor } from '@/components/FieldSetEditor';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import useAppStore from '../store/useAppStore';
import { ImageGrid } from '@/components/ImageGrid';
import { AnnotationWorkspace } from '@/components/AnnotationWorkspace';
import { Progress } from '@/components/ui/progress';

export function HomePage() {
  const [folders, setFolders] = useState<string[]>([]);
  const {
    currentFolder,
    fieldSet,
    setCurrentFolder,
    setFieldSet,
    clearStateForNewFolder,
    selectedImage,
    images,
  } = useAppStore();

  const [isLoading, setIsLoading] = useState(true);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [labeledImages, setLabeledImages] = useState<string[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    const fetchFolders = async () => {
      try {
        const folderList = await getFolders();
        setFolders(folderList);
      } catch (error) {
        console.error("Failed to fetch folders", error);
        toast({ title: "Error", description: "Could not fetch folders.", variant: "destructive" });
      } finally {
        setIsLoading(false);
      }
    };
    fetchFolders();
  }, [toast]);

  const handleFolderSelect = async (folder: string) => {
    setCurrentFolder(folder);
    clearStateForNewFolder();
    setLabeledImages([]); // Reset progress
    try {
      const fetchedFieldSet = await getFieldSet(folder);
      setFieldSet(fetchedFieldSet);
      if (!fetchedFieldSet) {
        setIsEditorOpen(true);
      }
      // Fetch label list for progress bar
      const labelList = await getLabelList(folder);
      setLabeledImages(labelList);
    } catch (error) {
      console.error(`Failed to fetch fieldset for ${folder}`, error);
      toast({ title: "Error", description: `Could not fetch field set for ${folder}.`, variant: "destructive" });
    }
  };

  const handleSaveFieldSet = async (newFieldSet: FieldSet) => {
    if (!currentFolder) return;
    try {
      await saveFieldSet(currentFolder, newFieldSet);
      setFieldSet(newFieldSet);
      setIsEditorOpen(false);
      toast({ title: "Success", description: "Field set saved successfully." });
    } catch (error) {
      console.error(`Failed to save fieldset for ${currentFolder}`, error);
      toast({ title: "Error", description: "Could not save the field set.", variant: "destructive" });
    }
  };

  const progressValue = images.length > 0 ? (labeledImages.length / images.length) * 100 : 0;

  if (selectedImage) {
    return <AnnotationWorkspace />;
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-8">
        <label className="text-lg font-semibold">Select Dataset Folder:</label>
        <Select onValueChange={handleFolderSelect} value={currentFolder ?? ''}>
          <SelectTrigger className="w-[280px]">
            <SelectValue placeholder="Select a folder..." />
          </SelectTrigger>
          <SelectContent>
            {folders.map(folder => (
              <SelectItem key={folder} value={folder}>{folder}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <p>Loading folders...</p>}

      {currentFolder && fieldSet && (
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium">Progress</h3>
            <span className="text-sm text-muted-foreground">{labeledImages.length} / {images.length}</span>
          </div>
          <Progress value={progressValue} className="w-full" />
        </div>
      )}

      {currentFolder && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Working on: <span className="text-emerald-500">{currentFolder}</span></h2>
            {fieldSet && (
              <Button onClick={() => window.location.href = `/api/export/${currentFolder}`}>
                Export to ZIP
              </Button>
            )}
          </div>

          {fieldSet ? (
            <div>
              <p className="mb-4">Field set is loaded. You can now proceed to label images.</p>
              <ImageGrid />
            </div>
          ) : (
            <div className="text-center p-8 border-2 border-dashed rounded-lg">
              <p className="mb-4 text-muted-foreground">No field set defined for this folder.</p>
              <Button onClick={() => setIsEditorOpen(true)}>Create Field Set</Button>
            </div>
          )}
        </div>
      )}

      {currentFolder && (
        <FieldSetEditor
          folderName={currentFolder}
          open={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          onSave={handleSaveFieldSet}
        />
      )}
    </div>
  );
}
