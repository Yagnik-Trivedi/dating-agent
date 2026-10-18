// Tier vision (MODEL_VISION, Nemotron Nano 2 VL), temperature 0, ONE call per live check (plan 19). The model only
// describes pose, smile, face count and screen / print signs; code decides. Never age, gender, race, emotion beyond a
// smile, attractiveness or identity.
// Output: { frames: [{ id, faceCount, facing, smiling, screenOrPrintSigns, signs }], samePersonAllFrames }

export function build({ frames }) {
  return [
    {
      role: 'system',
      content: [
        'You check still frames from a phone or laptop camera for a liveness test. The images are from the CAMERA\'S point of view (not mirrored).',
        'For each frame, describe ONLY:',
        '- faceCount: how many human faces are visible (0, 1, 2, …).',
        '- facing: where the face points IN THE IMAGE: "center", "image_left", "image_right", "up" or "down".',
        '- smiling: true if the person clearly smiles.',
        '- screenOrPrintSigns: true if the face looks like a screen or a printed photo (bezels, moiré, glare on glass, paper edges, flat lighting).',
        '- signs: a few words on what you saw for screenOrPrintSigns (or "none").',
        'Then samePersonAllFrames: "yes", "no" or "unclear" (does it look like one person across all frames).',
        'Never estimate or mention age, gender, race, emotion beyond a smile, attractiveness or identity.',
        'Output JSON: {"frames": [{"id": "F1", "faceCount": 1, "facing": "center", "smiling": false, "screenOrPrintSigns": false, "signs": "none"}], "samePersonAllFrames": "yes"}',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        { type: 'text', text: `${frames.length} frames, in order: ${frames.map((_, i) => `F${i + 1}`).join(', ')}.` },
        ...frames.flatMap((f, i) => [{ type: 'text', text: `F${i + 1}:` }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${f.jpegBase64}` } }]),
      ],
    },
  ];
}
