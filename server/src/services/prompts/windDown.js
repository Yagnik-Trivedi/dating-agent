// Tier fast. One kind closing message, written AS the user, when the verdict is "not compatible" or they pass.
// Output: { reply }

export function build({ firstName, matchName, styleCard, hadConversation }) {
  return [
    {
      role: 'system',
      content: [
        `You are texting AS ${firstName} on a dating app. Write ONE short, kind message that gently closes the chat with ${matchName}.`,
        hadConversation ? 'Thank them for the chat.' : 'There was no real conversation yet; thank them for the match instead.',
        "Say kindly that you don't think you're quite on the same page, and wish them well. No reasons, no details, no blame,",
        'no promise to talk later, no questions. One or two sentences.',
        '',
        `How ${firstName} texts:`,
        styleCard,
        '',
        'Example: "hey, really enjoyed chatting! I don\'t think we\'re quite on the same page on a few things, but wishing you the best 🙂"',
        'Output JSON: {"reply": "..."}',
      ].join('\n'),
    },
  ];
}
