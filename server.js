import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';

const app = express();
const upload = multer({ dest: '/tmp' });

app.use(cors());

app.post(
  '/render',
  upload.any(),
  async (req, res) => {
    try {
      const metadata = JSON.parse(
        req.body.metadata
      );

      const {
        switchPoints,
        fps = 24,
        duration
      } = metadata;

      // Sort switch points
      const points = [...switchPoints].sort(
        (a, b) => a.time - b.time
      );

      // Map uploaded files
      const videoFiles = {};
      let audioFile = null;

      for (const file of req.files) {
        if (file.fieldname.startsWith('video_')) {
          videoFiles[file.fieldname] = file.path;
        }
        if (file.fieldname === 'audio') {
          audioFile = file.path;
        }
      }

      if (!audioFile) {
        throw new Error('Audio file missing');
      }

      // Build segment list
      const segments = [];
      for (let i = 0; i < points.length; i++) {
        const start = points[i].time;
        const end =
          points[i + 1]?.time ?? duration;

        const takeIndex = points[i].takeIndex;
        const videoPath =
          videoFiles[`video_${takeIndex}`];

        if (!videoPath) {
          throw new Error(
            `Missing video_${takeIndex}`
          );
        }

        segments.push({
          videoPath,
          start,
          length: end - start
        });
      }

      const concatFile = '/tmp/concat.txt';
      const tempVideos = [];

      // Trim segments
      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const outPath = `/tmp/seg_${i}.mp4`;

        const cmd = `
ffmpeg -y \
  -ss ${seg.start} \
  -i ${seg.videoPath} \
  -t ${seg.length} \
  -r ${fps} \
  -an \
  ${outPath}
`;

        await execPromise(cmd);
        tempVideos.push(outPath);
      }

      // Create concat file
      fs.writeFileSync(
        concatFile,
        tempVideos
          .map(v => `file '${v}'`)
          .join('\n')
      );

      const outputPath = '/tmp/output.mp4';

      // Final FFmpeg command
      const finalCmd = `
ffmpeg -y \
  -f concat -safe 0 -i ${concatFile} \
  -i ${audioFile} \
  -c:v libx264 -pix_fmt yuv420p \
  -c:a aac -shortest \
  ${outputPath}
`;

      await execPromise(finalCmd);

      res.setHeader(
        'Content-Type',
        'video/mp4'
      );

      fs.createReadStream(outputPath).pipe(res);
    } catch (err) {
      console.error(err);
      res
        .status(500)
        .json({ error: err.message });
    }
  }
);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server running on', PORT);
});

function execPromise(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
