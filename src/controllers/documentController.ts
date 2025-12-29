import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../prisma/client';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow all file types for now
    cb(null, true);
  }
});

export const uploadMiddleware = upload.single('file');

export const uploadDocument = async (req: AuthRequest, res: Response) => {
  try {
    const { meetingId } = req.params;
    const userId = req.userId;
    const file = (req as any).file;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!meetingId) {
      return res.status(400).json({ message: 'Meeting ID is required' });
    }

    if (!file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Verify meeting exists
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId }
    });

    if (!meeting) {
      // Delete uploaded file if meeting doesn't exist
      fs.unlinkSync(file.path);
      return res.status(404).json({ message: 'Meeting not found' });
    }

    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true }
    });

    if (!user) {
      fs.unlinkSync(file.path);
      return res.status(404).json({ message: 'User not found' });
    }

    // Save document to database
    const document = await prisma.document.create({
      data: {
        meetingId,
        userId,
        fileName: file.originalname,
        filePath: file.path,
        fileSize: file.size,
        mimeType: file.mimetype,
        uploadedBy: `${user.firstName} ${user.lastName}`
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    return res.status(201).json({
      document: {
        id: document.id,
        fileName: document.fileName,
        fileSize: document.fileSize,
        mimeType: document.mimeType,
        uploadedBy: document.uploadedBy,
        createdAt: document.createdAt,
        size: formatFileSize(document.fileSize)
      }
    });
  } catch (err: any) {
    console.error('Upload document error:', err);
    // Clean up file if it was uploaded but database save failed
    if ((req as any).file?.path) {
      try {
        fs.unlinkSync((req as any).file.path);
      } catch (unlinkErr) {
        console.error('Error deleting file:', unlinkErr);
      }
    }
    return res.status(500).json({
      message: err?.message || 'Server error',
      error: err?.code
    });
  }
};

export const getDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const { meetingId } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (!meetingId) {
      return res.status(400).json({ message: 'Meeting ID is required' });
    }

    // Verify meeting exists
    const meeting = await prisma.meeting.findUnique({
      where: { id: meetingId }
    });

    if (!meeting) {
      return res.status(404).json({ message: 'Meeting not found' });
    }

    const documents = await prisma.document.findMany({
      where: { meetingId },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    return res.json({
      documents: documents.map(doc => ({
        id: doc.id,
        fileName: doc.fileName,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        uploadedBy: doc.uploadedBy,
        createdAt: doc.createdAt,
        size: formatFileSize(doc.fileSize)
      }))
    });
  } catch (err: any) {
    console.error('Get documents error:', err);
    return res.status(500).json({
      message: err?.message || 'Server error',
      error: err?.code
    });
  }
};

export const downloadDocument = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const document = await prisma.document.findUnique({
      where: { id }
    });

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Check if file exists
    if (!fs.existsSync(document.filePath)) {
      return res.status(404).json({ message: 'File not found on server' });
    }

    // Set headers for file download
    res.setHeader('Content-Disposition', `attachment; filename="${document.fileName}"`);
    res.setHeader('Content-Type', document.mimeType);

    // Stream the file
    const fileStream = fs.createReadStream(document.filePath);
    fileStream.pipe(res);
  } catch (err: any) {
    console.error('Download document error:', err);
    return res.status(500).json({
      message: err?.message || 'Server error',
      error: err?.code
    });
  }
};

export const getAllDocuments = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    // Get all documents for meetings created by the user or documents uploaded by the user
    const documents = await prisma.document.findMany({
      where: {
        OR: [
          { userId }, // Documents uploaded by the user
          {
            meeting: {
              createdById: userId // Documents from meetings created by the user
            }
          }
        ]
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        },
        meeting: {
          select: {
            id: true,
            title: true,
            boardroom: true,
            status: true
          }
        }
      }
    });

    return res.json({
      documents: documents.map(doc => ({
        id: doc.id,
        fileName: doc.fileName,
        fileSize: doc.fileSize,
        mimeType: doc.mimeType,
        uploadedBy: doc.uploadedBy,
        createdAt: doc.createdAt,
        size: formatFileSize(doc.fileSize),
        meeting: doc.meeting,
        user: doc.user
      }))
    });
  } catch (err: any) {
    console.error('Get all documents error:', err);
    return res.status(500).json({
      message: err?.message || 'Server error',
      error: err?.code
    });
  }
};

export const deleteDocument = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.userId;

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const document = await prisma.document.findUnique({
      where: { id }
    });

    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Check if user owns the document or is admin
    if (document.userId !== userId) {
      // In a real app, you might want to check admin role here
      return res.status(403).json({ message: 'Access denied' });
    }

    // Delete file from filesystem
    if (fs.existsSync(document.filePath)) {
      fs.unlinkSync(document.filePath);
    }

    // Delete from database
    await prisma.document.delete({
      where: { id }
    });

    return res.json({ message: 'Document deleted successfully' });
  } catch (err: any) {
    console.error('Delete document error:', err);
    return res.status(500).json({
      message: err?.message || 'Server error',
      error: err?.code
    });
  }
};

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

