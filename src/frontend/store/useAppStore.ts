import { create } from 'zustand';
import { FieldSet, ImageLabel } from '../types';

interface AppState {
  currentFolder?: string;
  fieldSet?: FieldSet;
  images: string[];
  labels: Record<string, ImageLabel>;
  selectedImage?: string;
}

interface AppActions {
  setCurrentFolder: (folder: string) => void;
  setFieldSet: (fieldSet: FieldSet) => void;
  setImages: (images: string[]) => void;
  setLabel: (imageName: string, label: ImageLabel) => void;
  clearStateForNewFolder: () => void;
  setSelectedImage: (imageName?: string) => void;
}

const useAppStore = create<AppState & AppActions>((set) => ({
  currentFolder: undefined,
  fieldSet: undefined,
  images: [],
  labels: {},
  selectedImage: undefined,

  setCurrentFolder: (folder) => set({ currentFolder: folder }),
  setFieldSet: (fieldSet) => set({ fieldSet }),
  setImages: (images) => set({ images }),
  setLabel: (imageName, label) =>
    set((state) => ({
      labels: {
        ...state.labels,
        [imageName]: label,
      },
    })),
  clearStateForNewFolder: () =>
    set({
      fieldSet: undefined,
      images: [],
      labels: {},
    }),
  setSelectedImage: (imageName) => set({ selectedImage: imageName }),
}));

export default useAppStore;
