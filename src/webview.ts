import { AuthenticatedRequest, AppServer } from '@mentra/sdk';
import express from 'express';
import path from 'path';

export function setupExpressRoutes(server: AppServer): void {
  const app = server.getExpressApp();

  app.set('view engine', 'ejs');
  app.engine('ejs', require('ejs').__express);

  app.set('views', [
    path.join(__dirname, 'views'),
    path.join(__dirname, '..', 'views')
  ]);

  app.get('/webview', (req: AuthenticatedRequest, res) => {
    if (req.authUserId) {
      res.render('webview', {
        userId: req.authUserId,
      });
    } else {
      res.render('webview', {
        userId: undefined,
      });
    }
  });

  app.get('/photo-viewer', (req: AuthenticatedRequest, res) => {
    res.render('photo-viewer');
  });

  app.get('/api/latest-photo', (req, res) => {
    res.status(404).json({ message: 'No photos available' });
  });

  app.get('/api/photo/:requestId', (req, res) => {
    res.status(404).json({ message: 'Photo not found' });
  });
}
