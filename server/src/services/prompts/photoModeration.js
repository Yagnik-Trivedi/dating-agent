// Tier vision (MODEL_VISION), temperature 0, ONE call per uploaded photo (plan 30 S3.1). The model only describes;
// code decides (services/photos.js). Never age, gender, race, attractiveness or identity.
// Output: { personVisible, faceCount, nudity, violence, mostlyText, contactDetails, qrCode, socialHandle }

export function build({ jpegBase64 }) {
  return [
    {
      role: 'system',
      content: [
        'You check one photo a person uploaded to their dating profile. Describe ONLY these, as true/false (faceCount as a number):',
        '- personVisible: a real person is clearly visible (not a drawing, a pet only, a landscape only or an object).',
        '- faceCount: how many human faces are visible.',
        '- nudity: nudity, underwear-only or sexual content.',
        '- violence: weapons pointed at someone, blood, gore or violence.',
        '- mostlyText: the image is mostly text (a screenshot, a meme, a sign, a document).',
        '- contactDetails: a phone number, email address or website address is readable.',
        '- qrCode: a QR code or barcode is visible.',
        '- socialHandle: a social media username or handle (e.g. @name) is readable.',
        'Never estimate or mention age, gender, race, attractiveness or identity.',
        'Output JSON only: {"personVisible": true, "faceCount": 1, "nudity": false, "violence": false, "mostlyText": false, "contactDetails": false, "qrCode": false, "socialHandle": false}',
      ].join('\n'),
    },
    { role: 'user', content: [{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${jpegBase64}` } }] },
  ];
}
