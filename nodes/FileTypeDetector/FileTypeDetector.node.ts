import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	NodeConnectionType,
} from 'n8n-workflow';

import { fileTypeFromBuffer } from 'file-type';
import { Buffer } from 'buffer';

export class FileTypeDetector implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'File Type Detector',
		name: 'fileTypeDetector',
		icon: 'file:fileTypeDetector.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Detect file types using magic bytes analysis',
		defaults: {
			name: 'File Type Detector',
		},
		inputs: [NodeConnectionType.Main],
		outputs: [NodeConnectionType.Main],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Detect File Type',
						value: 'detect',
						description: 'Analyze binary data to detect file type',
						action: 'Detect file type from binary data',
					},
				],
				default: 'detect',
			},
			{
				displayName: 'Binary Property',
				name: 'binaryProperty',
				type: 'string',
				default: 'data',
				required: true,
				displayOptions: {
					show: {
						operation: ['detect'],
					},
				},
				description: 'Name of the binary property that contains the file data',
			},
			{
				displayName: 'Fallback to Original MIME Type',
				name: 'fallbackToOriginal',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						operation: ['detect'],
					},
				},
				description: 'Whether to use original MIME type if detection fails',
			},
			{
				displayName: 'Include File Categories',
				name: 'includeCategories',
				type: 'boolean',
				default: true,
				displayOptions: {
					show: {
						operation: ['detect'],
					},
				},
				description: 'Whether to include categorized file types (image, document, etc.)',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const operation = this.getNodeParameter('operation', 0);

		for (let i = 0; i < items.length; i++) {
			try {
				if (operation === 'detect') {
					const binaryProperty = this.getNodeParameter('binaryProperty', i) as string;
					const fallbackToOriginal = this.getNodeParameter('fallbackToOriginal', i) as boolean;
					const includeCategories = this.getNodeParameter('includeCategories', i) as boolean;

					const item = items[i];

					if (!item.binary || !item.binary[binaryProperty]) {
						throw new NodeOperationError(
							this.getNode(),
							`No binary data found in property "${binaryProperty}"`,
							{ itemIndex: i },
						);
					}

					const binaryData = item.binary[binaryProperty];
					const buffer = Buffer.from(binaryData.data, 'base64');

					// Detect file type using magic bytes
					const detectedType = await fileTypeFromBuffer(buffer);

					// Prepare result object
					const result: any = {
						originalMimeType: binaryData.mimeType || 'unknown',
						fileName: binaryData.fileName || 'unknown',
						fileSize: buffer.length,
						detectionMethod: detectedType ? 'magic-bytes' : 'fallback',
						confident: !!detectedType,
					};

					if (detectedType) {
						result.detectedMimeType = detectedType.mime;
						result.detectedExtension = detectedType.ext;
						result.typeName = detectedType.mime.split('/')[1];
					} else {
						// Fallback to original MIME type if requested
						if (fallbackToOriginal && binaryData.mimeType) {
							result.detectedMimeType = binaryData.mimeType;
							result.detectedExtension = getExtensionFromMimeType(binaryData.mimeType);
						} else {
							result.detectedMimeType = 'application/octet-stream';
							result.detectedExtension = 'bin';
						}
					}

					// Add file categories if requested
					if (includeCategories) {
						result.fileCategory = categorizeFileType(result.detectedMimeType);
					}

					returnData.push({
						json: {
							...item.json,
							fileTypeAnalysis: result,
						},
						binary: item.binary,
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							...items[i].json,
							error: error.message,
						},
						binary: items[i].binary,
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}

// Helper functions outside the class
function getExtensionFromMimeType(mimeType: string): string {
	const mimeToExtension: { [key: string]: string } = {
		'image/jpeg': 'jpg',
		'image/png': 'png',
		'image/gif': 'gif',
		'image/bmp': 'bmp',
		'image/webp': 'webp',
		'image/svg+xml': 'svg',
		'application/pdf': 'pdf',
		'text/plain': 'txt',
		'application/json': 'json',
		'text/html': 'html',
		'text/css': 'css',
		'application/javascript': 'js',
		'video/mp4': 'mp4',
		'video/avi': 'avi',
		'audio/mpeg': 'mp3',
		'audio/wav': 'wav',
		'application/zip': 'zip',
		'application/x-rar-compressed': 'rar',
	};

	return mimeToExtension[mimeType] || 'unknown';
}

function categorizeFileType(mimeType: string): string {
	if (mimeType.startsWith('image/')) return 'image';
	if (mimeType.startsWith('video/')) return 'video';
	if (mimeType.startsWith('audio/')) return 'audio';
	if (mimeType === 'application/pdf') return 'document';
	if (mimeType.includes('document') || mimeType.includes('text')) return 'document';
	if (mimeType.includes('spreadsheet')) return 'spreadsheet';
	if (mimeType.includes('presentation')) return 'presentation';
	if (mimeType.includes('zip') || mimeType.includes('archive') || mimeType.includes('rar'))
		return 'archive';
	if (mimeType.includes('javascript') || mimeType.includes('json') || mimeType.includes('html'))
		return 'code';
	return 'other';
}
