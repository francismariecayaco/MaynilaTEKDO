// Helper utilities for uploading files to Firebase Storage
import { storage } from './config.js';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

/**
 * Upload a File object to Firebase Storage with basic validation.
 * @param {File} file - the browser File/Blob to upload
 * @param {string} destPrefix - destination path prefix in the bucket (e.g. "companies/{id}/logo_")
 * @param {{maxSize?:number, allowedTypes?:string[]}} opts
 * @returns {Promise<{url:string, fullPath:string, name:string}>}
 */
export async function uploadFile(file, destPrefix, opts = {}){
  const maxSize = opts.maxSize || 10 * 1024 * 1024; // 10MB default
  const allowedTypes = opts.allowedTypes || ['image/png','image/jpeg','image/jpg','image/webp'];
  if (file.size > maxSize) throw new Error('File is too large (max '+(maxSize/1024/1024)+'MB)');
  if (allowedTypes.length && file.type && !allowedTypes.includes(file.type)) throw new Error('File type not allowed: '+file.type);

  const extMatch = file.name && file.name.match(/(\.[^.]+)$/);
  const ext = extMatch ? extMatch[1] : '';
  const name = `${destPrefix}${Date.now()}_${Math.random().toString(36).slice(2,6)}${ext}`;
  const r = storageRef(storage, name);
  await uploadBytes(r, file);
  const url = await getDownloadURL(r);
  return { url, fullPath: r.fullPath, name };
}

export default { uploadFile };
