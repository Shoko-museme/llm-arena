import axios from 'axios';
import { FieldSet, ImageLabel } from '../types';

const api = axios.create({
  baseURL: '/api',
});

export const getFolders = async (): Promise<string[]> => {
  const response = await api.get('/folders');
  return response.data;
};

export const getFieldSet = async (folder: string): Promise<FieldSet | null> => {
  try {
    const response = await api.get(`/fields/${folder}`);
    return response.data;
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      return null;
    }
    throw error;
  }
};

export const saveFieldSet = async (folder: string, fieldSet: FieldSet): Promise<void> => {
  await api.post(`/fields/${folder}`, fieldSet);
};

export const getImages = async (folder: string): Promise<string[]> => {
  try {
    const response = await api.get(`/images/${folder}`);
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch images for folder ${folder}`, error);
    throw error;
  }
};

export const getLabel = async (folder: string, imageName: string): Promise<ImageLabel | null> => {
  try {
    const response = await api.get(`/label/${folder}/${imageName}`);
    return response.data;
  } catch (error: any) {
    if (error.response && error.response.status === 404) {
      return null;
    }
    console.error(`Failed to fetch label for ${imageName} in ${folder}`, error);
    throw error;
  }
};

export const saveLabel = async (folder: string, imageName: string, label: ImageLabel): Promise<void> => {
  await api.post(`/label/${folder}/${imageName}`, label);
};

export const getLabelList = async (folder: string): Promise<string[]> => {
  try {
    const response = await api.get(`/labels/${folder}`);
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch label list for folder ${folder}`, error);
    throw error;
  }
};

export const resetImage = async (folder: string, imageName: string): Promise<void> => {
  await api.post(`/reset/${folder}/${imageName}`);
};

export const initializeProcessedImage = async (folder: string, imageName: string): Promise<{ action: string; hasExistingLabel?: boolean }> => {
  const response = await api.post(`/initialize/${folder}/${imageName}`);
  return response.data;
};

export const rotateImage = async (folder: string, imageName: string, rotation: number): Promise<{ newRotation: number }> => {
  const response = await api.post(`/rotate/${folder}/${imageName}`, { rotation });
  return response.data;
};
