import { Router } from 'express';
import { z } from 'zod';
import { Profile } from '../models/Profile.js';
import { addPhoto, removePhoto, reorderPhotos, uploadTicket } from '../services/photos.js';
import { objectId, parse } from '../utils/http.js';

const dims = { w: z.number().int().positive().max(4000), h: z.number().int().positive().max(4000) };
const addBody = z.union([
  z.object({ url: z.url().max(500), publicId: z.string().max(200), ...dims }),
  z.object({ jpegBase64: z.string().max(450_000).regex(/^[A-Za-z0-9+/=]+$/), ...dims }), // local stub: ≤ ~330 KB
]);

export const photosRouter = Router();

const mine = async (userId) => (await Profile.findOne({ userId }, { photoUploads: 1 }).lean())?.photoUploads ?? [];

photosRouter.get('/photos', async (req, res) => res.json({ photos: await mine(req.user._id) }));
photosRouter.post('/photos/ticket', (req, res) => res.json(uploadTicket()));
photosRouter.post('/photos', async (req, res) => {
  const photo = await addPhoto(req.user._id, parse(addBody, req.body), `${req.protocol}://${req.get('host')}`);
  res.status(201).json({ photo });
});
photosRouter.put('/photos/order', async (req, res) => {
  await reorderPhotos(req.user._id, parse(z.object({ ids: z.array(objectId).max(6) }), req.body).ids);
  res.json({ photos: await mine(req.user._id) });
});
photosRouter.delete('/photos/:id', async (req, res) => {
  await removePhoto(req.user._id, parse(objectId, req.params.id));
  res.json({ photos: await mine(req.user._id) });
});
