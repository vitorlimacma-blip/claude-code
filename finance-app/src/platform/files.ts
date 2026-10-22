import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Hands a text file to the user: on iOS/Android it opens the share sheet
 * (save to Files, send to the computer...). Web version: `files.web.ts`.
 */
export async function saveTextFile(fileName: string, content: string, mimeType: string): Promise<void> {
  const file = new File(Paths.cache, fileName);
  if (file.exists) file.delete();
  file.create();
  await file.write(content);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing unavailable');
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName });
}

/** Lets the user pick a text file and returns its contents, or null if they cancel. */
export async function pickTextFile(mimeTypes: string[]): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: mimeTypes, copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return null;
  return new File(result.assets[0].uri).text();
}
