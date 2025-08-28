import { useState, useEffect } from 'react';
import useAppStore from '../store/useAppStore';
import { FieldValues } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface FieldFormProps {
  initialValues: FieldValues;
  onFieldsChange: (newValues: FieldValues) => void;
  onSave: () => void;
  isSaving: boolean;
}

export const FieldForm = ({ initialValues, onFieldsChange, onSave, isSaving }: FieldFormProps) => {
  const { fieldSet } = useAppStore();
  const [formValues, setFormValues] = useState<FieldValues>(initialValues);

  // Sync state when initialValues change (e.g., user selects a different box)
  useEffect(() => {
    setFormValues(initialValues);
  }, [initialValues]);

  if (!fieldSet) {
    return <div>Loading field set...</div>;
  }

  const handleInputChange = (key: string, value: string | boolean | number) => {
    const newValues = { ...formValues, [key]: value };
    setFormValues(newValues);
    onFieldsChange(newValues); // Notify parent component of the change
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg h-full overflow-y-auto">
      <h3 className="text-lg font-semibold">Fields</h3>
      {fieldSet.fields.map((field) => (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={field.key}>{field.label}</Label>
          {field.type === 'text' && (
            <Input 
              id={field.key} 
              value={formValues[field.key] as string || ''} 
              onChange={(e) => handleInputChange(field.key, e.target.value)}
            />
          )}
          {field.type === 'boolean' && (
            <Select 
              value={formValues[field.key] ? 'true' : 'false'} 
              onValueChange={(value) => handleInputChange(field.key, value === 'true')}
            >
              <SelectTrigger>
                <SelectValue placeholder={`Select ${field.label}...`} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">Yes</SelectItem>
                <SelectItem value="false">No</SelectItem>
              </SelectContent>
            </Select>
          )}
          {field.type === 'select' && field.options && (
            <Select 
              value={formValues[field.key] as string || ''} 
              onValueChange={(value) => handleInputChange(field.key, value)}
            >
              <SelectTrigger>
                <SelectValue placeholder={`Select ${field.label}...`} />
              </SelectTrigger>
              <SelectContent>
                {field.options.map((option) => (
                  <SelectItem key={option} value={option}>{option}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      ))}
      <Button type="submit" disabled={isSaving}>
        {isSaving ? 'Saving...' : 'Save & Next'}
      </Button>
    </form>
  );
};
