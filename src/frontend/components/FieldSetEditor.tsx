import { useState } from 'react';
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Field, FieldSet } from '../types';
import { Checkbox } from './ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Trash2 } from 'lucide-react';

interface FieldSetEditorProps {
  folderName: string;
  open: boolean;
  onClose: () => void;
  onSave: (fieldSet: FieldSet) => void;
}

const createNewField = (): Field => ({
  key: '',
  label: '',
  type: 'text',
});

export function FieldSetEditor({ folderName, open, onClose, onSave }: FieldSetEditorProps) {
  const [fields, setFields] = useState<Field[]>([createNewField()]);
  const [drawBoxes, setDrawBoxes] = useState(false);

  const handleSave = () => {
    const newFieldSet: FieldSet = {
      createdAt: new Date().toISOString(),
      drawBoxesOnImage: drawBoxes,
      fields: fields.filter(f => f.key && f.label), // Filter out empty fields
    };
    onSave(newFieldSet);
  };

  const updateField = (index: number, updatedField: Partial<Field>) => {
    const newFields = [...fields];
    newFields[index] = { ...newFields[index], ...updatedField };
    setFields(newFields);
  };

  const addField = () => {
    setFields([...fields, createNewField()]);
  };

  const removeField = (index: number) => {
    setFields(fields.filter((_, i) => i !== index));
  };


  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[625px]">
        <DialogHeader>
          <DialogTitle>Create Field Set for "{folderName}"</DialogTitle>
          <DialogDescription>
            Define the fields you want to label for each image in this dataset.
          </DialogDescription>
        </DialogHeader>
        
        <div className="max-h-[60vh] overflow-y-auto pr-4">
          {fields.map((field, index) => (
            <div key={index} className="grid grid-cols-12 gap-2 items-center border-b pb-4 mb-4">
              <div className="col-span-3">
                <Label htmlFor={`key-${index}`}>Field Key</Label>
                <Input id={`key-${index}`} value={field.key} onChange={e => updateField(index, { key: e.target.value.trim() })} placeholder="e.g., jobType" />
              </div>
              <div className="col-span-3">
                <Label htmlFor={`label-${index}`}>Display Label</Label>
                <Input id={`label-${index}`} value={field.label} onChange={e => updateField(index, { label: e.target.value })} placeholder="e.g., Job Type" />
              </div>
              <div className="col-span-2">
                <Label htmlFor={`type-${index}`}>Type</Label>
                <Select value={field.type} onValueChange={(value: Field['type']) => updateField(index, { type: value })}>
                  <SelectTrigger id={`type-${index}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="boolean">Boolean</SelectItem>
                    <SelectItem value="select">Select</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3">
                <Label htmlFor={`options-${index}`}>Options (CSV)</Label>
                <Input 
                  id={`options-${index}`} 
                  disabled={field.type !== 'select'}
                  value={field.options?.join(',') ?? ''} 
                  onChange={e => updateField(index, { options: e.target.value.split(',').map(s => s.trim()) })}
                  placeholder="e.g., option1,option2"
                />
              </div>
              <div className="col-span-1 self-end">
                <Button variant="ghost" size="icon" onClick={() => removeField(index)} disabled={fields.length <= 1}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
          <Button onClick={addField} variant="outline" className="mt-2">Add Field</Button>
        </div>

        <div className="flex items-center space-x-2">
            <Checkbox id="draw-boxes" checked={drawBoxes} onCheckedChange={(checked) => setDrawBoxes(!!checked)} />
            <label htmlFor="draw-boxes" className="text-sm font-medium leading-none">
                Draw bounding boxes on saved images
            </label>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" onClick={handleSave}>Save Field Set</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
