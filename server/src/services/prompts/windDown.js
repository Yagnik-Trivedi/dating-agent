// Tier fast. One kind closing message, written AS the user, when their judge says "no" or they pass.
// Style from their voice card, a few of their real messages (exemplars) and how they usually end chats.
// Output: { reply }

export function build({ firstName, matchName, styleCard, exemplars = [], closingStyle = null, hadConversation }) {
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
        exemplars.length ? `Real messages ${firstName} wrote (copy the style, never the content):\n${exemplars.map((e) => `- "${e}"`).join('\n')}` : '',
        closingStyle ? `${firstName} usually ends chats like: "${closingStyle}"` : '',
        '',
        'Example: "hey, really enjoyed chatting! I don\'t think we\'re quite on the same page on a few things, but wishing you the best 🙂"',
        'Output JSON: {"reply": "..."}',
      ].filter((l) => l !== null).join('\n'),
    },
  ];
}
