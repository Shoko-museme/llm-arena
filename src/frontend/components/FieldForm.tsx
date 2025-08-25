import useAppStore from '../store/useAppStore';
import { FieldValues } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';

interface FieldFormProps {
  initialValues: FieldValues;
  onSave: (values: FieldValues) => void;
  isSaving: boolean;
}

export const FieldForm = ({ initialValues, onSave, isSaving }: FieldFormProps) => {
  const { fieldSet } = useAppStore();

  if (!fieldSet) {
    return <div>Loading field set...</div>;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget as HTMLFormElement);
    const values: FieldValues = {};
    for (const [key, value] of formData.entries()) {
      const field = fieldSet.fields.find(f => f.key === key);
      if (field?.type === 'boolean') {
        values[key] = value === 'on';
      } else {
        values[key] = value as string;
      }
    }
    onSave(values);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg h-full overflow-y-auto">
      <h3 className="text-lg font-semibold">Fields</h3>
      {fieldSet.fields.map((field) => (
        <div key={field.key} className="space-y-2">
          <Label htmlFor={field.key}>{field.label}</Label>
          {field.type === 'text' && (
            <Input name={field.key} id={field.key} defaultValue={initialValues[field.key] as string || ''} />
          )}
          {field.type === 'boolean' && (
            <div className="flex items-center space-x-2">
              <Checkbox name={field.key} id={field.key} defaultChecked={!!initialValues[field.key]} />
              <label htmlFor={field.key}>Enable</label>
            </div>
          )}
          {field.type === 'select' && field.options && (
            <Select name={field.key} defaultValue={initialValues[field.key] as string || ''}>
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
      <Button type="submit" className="w-full" disabled={isSaving}>
        {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {isSaving ? 'Saving...' : 'Save Label'}
      </Button>
    </form>
  );
};
