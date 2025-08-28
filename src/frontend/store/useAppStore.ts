import { create } from 'zustand';
import { FieldSet, ImageLabel } from '../types';

interface AppState {
  currentFolder?: string;
  fieldSet?: FieldSet;
  images: string[];
  labels: Record<string, ImageLabel>;
  selectedImage?: string;
  currentPage: number;
  pageSize: number;
}

interface AppActions {
  setCurrentFolder: (folder: string) => void;
  setFieldSet: (fieldSet: FieldSet) => void;
  setImages: (images: string[]) => void;
  setLabel: (imageName: string, label: ImageLabel) => void;
  clearStateForNewFolder: () => void;
  setSelectedImage: (imageName?: string) => void;
  setCurrentPage: (page: number) => void;
  setPageSize: (size: number) => void;
  navigateToImagePage: (imageName: string) => void;
}

const useAppStore = create<AppState & AppActions>((set, get) => ({
  currentFolder: undefined,
  fieldSet: undefined,
  images: [],
  labels: {},
  selectedImage: undefined,
  currentPage: 1,
  pageSize: 24,

  setCurrentFolder: (folder) => set({ currentFolder: folder }),
  setFieldSet: (fieldSet) => set({ fieldSet }),
  setImages: (images) => set({ images, currentPage: 1 }), // Reset to first page when images change
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
      currentPage: 1,
    }),
  setSelectedImage: (imageName) => set({ selectedImage: imageName }),
  setCurrentPage: (page) => set({ currentPage: page }),
  setPageSize: (size) => set({ pageSize: size, currentPage: 1 }), // Reset to first page when page size changes
  navigateToImagePage: (imageName) => {
    const state = get();
    const imageIndex = state.images.indexOf(imageName);
    if (imageIndex !== -1) {
      const targetPage = Math.floor(imageIndex / state.pageSize) + 1;
      set({ currentPage: targetPage });
    }
  },
}));

export default useAppStore;
