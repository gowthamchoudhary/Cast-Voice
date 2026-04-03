import { db, storiesTable } from "@workspace/db";
import { logger } from "./logger";

const STORIES = [
  {
    title: "The Midnight Heist",
    genre: "Thriller",
    synopsis: "A crack team of specialists have one shot to steal the most valuable diamond in the world from a seemingly impenetrable museum — if they can trust each other long enough to pull it off.",
    sceneImagePrompt: "dark museum at midnight, glass cases glowing with blue light, a single diamond on a pedestal, security lasers, cinematic shadows",
    characters: [
      { id: "mastermind", name: "The Mastermind", description: "calm, strategic, authoritative — the quiet one who controls everything from the shadows" },
      { id: "hacker", name: "The Hacker", description: "nervous energy, fast-talking, slightly cocky — brilliant but anxious" },
      { id: "muscle", name: "The Muscle", description: "gruff, direct, few words — imposing physical presence, dry dark humor" },
      { id: "insider", name: "The Insider", description: "conflicted, guilty, trying to do the right thing — voice trembles with fear" },
      { id: "guard", name: "The Guard", description: "professional, suspicious, duty-bound — unaware he's being played" },
    ],
    scriptJson: {
      scenes: [
        {
          scene: 1,
          scene_description: "dark museum at midnight, security lasers, whispering voices",
          sfx_before: "low ambient hum, distant city traffic, security system beeping",
          lines: [
            { character: "The Mastermind", emotion: "calm, controlled, authoritative", stability: 0.7, text: "Listen carefully. We have exactly four minutes from the moment the power cuts. Not five. Four." },
            { character: "The Hacker", emotion: "nervous energy, fast, slightly cocky", stability: 0.2, text: "Four minutes is plenty. I've bypassed systems three times harder than this in my sleep. Literally. I dreamed about it once." },
            { character: "The Muscle", emotion: "gruff, minimal, serious", stability: 0.6, text: "Stop talking. Start working." },
            { character: "The Insider", emotion: "guilty, scared, conflicted", stability: 0.3, text: "If the guard does his 2 AM rounds early, we're finished. He sometimes does that." },
            { character: "The Mastermind", emotion: "calm, reassuring but firm", stability: 0.7, text: "He won't. I've been watching him for three weeks. He takes a coffee break at 1:58, every single night." },
            { character: "The Hacker", emotion: "excited, focused", stability: 0.2, text: "Systems are going dark in three... two... one. We're in. Move." },
          ],
        },
        {
          scene: 2,
          scene_description: "inside the vault room, tension rising",
          sfx_before: "alarm beeping in the distance, footsteps on marble",
          lines: [
            { character: "The Guard", emotion: "alert, suspicious, professional", stability: 0.6, text: "Hello? Is someone there?" },
            { character: "The Insider", emotion: "panicking, whispering", stability: 0.1, text: "That's him. He came early. What do we do?!" },
            { character: "The Mastermind", emotion: "ice cold, decisive", stability: 0.8, text: "We adapt. Everyone hold position. Do not move. Do not breathe." },
            { character: "The Muscle", emotion: "calm despite pressure", stability: 0.7, text: "I got him if he gets too close." },
            { character: "The Mastermind", emotion: "quiet, intense", stability: 0.8, text: "You won't need to. Trust the plan." },
            { character: "The Hacker", emotion: "relieved exhale", stability: 0.4, text: "He's walking away. We're clear. Diamond is right here. It's... it's actually beautiful." },
            { character: "The Mastermind", emotion: "satisfied, controlled", stability: 0.7, text: "Admire it later. We have ninety seconds." },
          ],
        },
      ],
    },
  },
  {
    title: "The Lost Kingdom",
    genre: "Fantasy",
    synopsis: "A unlikely hero discovers an ancient sword and must unite a broken fellowship to face the dark villain who shattered the kingdom — guided by a wise mentor and an unexpected creature companion.",
    sceneImagePrompt: "ancient ruined kingdom at sunset, golden light through broken stone arches, a glowing sword in the ground, mystical fog, epic fantasy landscape",
    characters: [
      { id: "hero", name: "The Hero", description: "brave but uncertain, young and earnest, discovering their power — voice full of wonder and determination" },
      { id: "friend", name: "The Loyal Friend", description: "warm, steadfast, practical — the grounding voice of reason and unwavering loyalty" },
      { id: "mentor", name: "The Wise Mentor", description: "ancient, calm, knowing — speaks in measured tones, each word carrying the weight of centuries" },
      { id: "villain", name: "The Dark Villain", description: "commanding, cold, seething with barely contained power — terrifying calm that breaks into fury" },
      { id: "creature", name: "The Creature Companion", description: "ancient, gentle, otherworldly — speaks rarely but with profound wisdom" },
    ],
    scriptJson: {
      scenes: [
        {
          scene: 1,
          scene_description: "ruined throne room, golden light, a sword embedded in stone",
          sfx_before: "wind through stone ruins, distant magical hum, birds calling",
          lines: [
            { character: "The Hero", emotion: "awestruck, uncertain", stability: 0.4, text: "The sword. It's real. Everything the stories said — it's real." },
            { character: "The Loyal Friend", emotion: "warm but cautious", stability: 0.6, text: "Don't touch it yet. The mentor said we needed to know more before — " },
            { character: "The Hero", emotion: "determined, impulsive", stability: 0.3, text: "We don't have time for more. The dark army is three days behind us." },
            { character: "The Wise Mentor", emotion: "ancient, knowing, calm", stability: 0.8, text: "The sword does not choose the worthy. The worthy choose the sword. That is the difference. Are you ready to carry what it means?" },
            { character: "The Creature Companion", emotion: "ancient, gentle, warning", stability: 0.7, text: "The weight of kingdoms is not iron. It is grief. Are you prepared for grief?" },
            { character: "The Hero", emotion: "resolute, emotional", stability: 0.5, text: "I don't know if I am. But I know what happens if I'm not. And I can't let that happen." },
          ],
        },
        {
          scene: 2,
          scene_description: "confrontation with the dark villain at the ruined gates",
          sfx_before: "thunder, dark winds, the sound of an army approaching",
          lines: [
            { character: "The Dark Villain", emotion: "ice cold, contemptuous power", stability: 0.8, text: "You pulled the sword from the stone. I'm almost impressed. No one has managed that in three centuries. Almost." },
            { character: "The Hero", emotion: "scared but holding their ground", stability: 0.3, text: "It's over. Whatever you've built here — it ends today." },
            { character: "The Dark Villain", emotion: "laughing, then suddenly deadly serious", stability: 0.7, text: "You think a sword changes what I am? I am what this kingdom made me. I am its consequence. And you... you are just a child playing with an heirloom." },
            { character: "The Loyal Friend", emotion: "fierce, protective", stability: 0.5, text: "Then you've already made your mistake. Heroes don't win because of swords. They win because of what's standing next to them." },
            { character: "The Wise Mentor", emotion: "quiet power", stability: 0.9, text: "This ends now." },
          ],
        },
      ],
    },
  },
  {
    title: "The Haunted House on Willow Street",
    genre: "Horror",
    synopsis: "Five friends make the worst decision of their lives when they enter the abandoned house at the end of Willow Street — and discover that something inside has been waiting for company.",
    sceneImagePrompt: "abandoned Victorian house at night, broken windows glowing faintly, dead trees, fog on the ground, single flickering light inside, moonless sky",
    characters: [
      { id: "skeptic", name: "The Skeptic", description: "dismissive, rational, too confident — voice dripping with sarcasm that slowly erodes into terror" },
      { id: "scared", name: "The Scared One", description: "terrified from the start, voice constantly shaking, high-pitched panic barely held back" },
      { id: "curious", name: "The Curious Explorer", description: "fascinated and reckless — excited where others are afraid, pays the price for it" },
      { id: "voice", name: "The Voice in the Dark", description: "whispering, ancient, unsettling — not quite human, echoing as if from inside the walls" },
      { id: "narrator", name: "Narrator", description: "calm, atmospheric, omniscient — like a storyteller beside a dying campfire" },
    ],
    scriptJson: {
      scenes: [
        {
          scene: 1,
          scene_description: "outside the house, fog rolling in, gate creaking",
          sfx_before: "wind, creaking metal gate, distant owl, footsteps on dead leaves",
          lines: [
            { character: "Narrator", emotion: "calm, atmospheric, building dread", stability: 0.8, text: "The house at the end of Willow Street had been empty for thirty-two years. Everyone in town had a different story about why. None of them were true." },
            { character: "The Skeptic", emotion: "dismissive, bored", stability: 0.7, text: "It's just an old house. Old wood, old pipes, bad reputation. Nothing more." },
            { character: "The Scared One", emotion: "voice trembling, high-pitched", stability: 0.2, text: "The gate is already open. We didn't open it. Nobody opened it." },
            { character: "The Curious Explorer", emotion: "excited, rushing forward", stability: 0.3, text: "That's amazing! Come on, this is why we came!" },
            { character: "The Skeptic", emotion: "sighing, following reluctantly", stability: 0.6, text: "Wind opens gates. It's physics, not ghosts." },
          ],
        },
        {
          scene: 2,
          scene_description: "inside, finding something written on the walls",
          sfx_before: "floorboards creaking, something dripping, silence that feels heavy",
          lines: [
            { character: "The Curious Explorer", emotion: "voice dropping to a whisper, unsettled for the first time", stability: 0.4, text: "There's writing on every wall. The same words. All the same words." },
            { character: "The Scared One", emotion: "barely a whisper, shaking", stability: 0.1, text: "What does it say?" },
            { character: "The Curious Explorer", emotion: "reading aloud, voice going hollow", stability: 0.4, text: "It says: 'Thank you for coming. I've been so alone.'" },
            { character: "The Voice in the Dark", emotion: "whispering from everywhere and nowhere, ancient, gentle but terrifying", stability: 0.6, text: "I wrote that for you. I've been writing it for thirty years. Waiting for someone who would read it." },
            { character: "The Skeptic", emotion: "voice cracking, all bravado gone", stability: 0.2, text: "We need to leave. Right now. We need to leave right now." },
            { character: "The Voice in the Dark", emotion: "sad, gentle, final", stability: 0.7, text: "But you only just arrived. And I have so many rooms to show you." },
          ],
        },
      ],
    },
  },
  {
    title: "The Space Mission — Last Signal",
    genre: "Sci-Fi",
    synopsis: "Deep in uncharted space, the crew of the Meridian receives a signal from something that shouldn't exist — and must decide whether to answer it before their oxygen runs out.",
    sceneImagePrompt: "deep space, a lone spaceship against a vast nebula, emergency red lighting inside cockpit, floating debris, distant unknown planet glowing faintly",
    characters: [
      { id: "captain", name: "The Captain", description: "weathered, decisive, carrying the weight of command — voice steady even when everything is falling apart" },
      { id: "ai", name: "The AI Assistant", description: "precise, calm, robotic but with subtle warmth — speaks in measured tones, occasionally reveals something almost like emotion" },
      { id: "engineer", name: "The Engineer", description: "brilliant but panicked, problem-solver under pressure — words tumble out fast when stressed" },
      { id: "scientist", name: "The Scientist", description: "fascinated by the impossible, lost in wonder even in crisis — speaks with quiet awe" },
      { id: "entity", name: "The Unknown Entity", description: "vast, alien, speaking in patterns that almost make sense — like language heard through static from very far away" },
    ],
    scriptJson: {
      scenes: [
        {
          scene: 1,
          scene_description: "emergency lighting, alarms, something has gone wrong",
          sfx_before: "spaceship alarm, hissing pressurization, emergency klaxon fading to silence",
          lines: [
            { character: "The AI Assistant", emotion: "calm, precise, carrying difficult news", stability: 0.9, text: "Captain. Hull breach sealed. However, I must inform you: oxygen reserves are now at fourteen percent. At current consumption, we have approximately eleven hours." },
            { character: "The Captain", emotion: "controlled but the weight is showing", stability: 0.7, text: "Eleven hours. And we're three days from the relay station." },
            { character: "The Engineer", emotion: "fast, panicked, working through it", stability: 0.2, text: "If we reduce oxygen consumption by seventy percent, shut down non-essential systems, maybe — maybe we get sixteen hours. That's not enough. That's still not enough." },
            { character: "The Scientist", emotion: "quiet, stunned with wonder", stability: 0.6, text: "Captain... I'm picking up a signal. It's on a frequency that doesn't exist. I mean — it can't exist. The physics don't allow it." },
            { character: "The Captain", emotion: "turning, alert", stability: 0.7, text: "What kind of signal?" },
            { character: "The Scientist", emotion: "barely a whisper", stability: 0.5, text: "It sounds like it's trying to talk to us." },
          ],
        },
        {
          scene: 2,
          scene_description: "the signal becomes a voice, the crew listens",
          sfx_before: "static, deep space ambience, something rhythmic in the noise",
          lines: [
            { character: "The Unknown Entity", emotion: "vast, alien, patterns emerging from static", stability: 0.5, text: "We have... watched... your kind... for a very long time. We did not... intervene. We observe. But you are... running out of time. We find this... difficult to permit." },
            { character: "The Captain", emotion: "controlled disbelief", stability: 0.7, text: "Who are you?" },
            { character: "The Unknown Entity", emotion: "considering, ancient", stability: 0.6, text: "We are... what comes after the stars. You do not have words for what we are. We have words for what you are. Interesting. Fragile. Worth... preserving." },
            { character: "The AI Assistant", emotion: "quietly processing, almost emotional", stability: 0.8, text: "Captain. I'm detecting what appears to be an oxygen processing array forming around our ship. It is not our technology." },
            { character: "The Engineer", emotion: "stunned, whispering", stability: 0.4, text: "We're going to be okay. We're actually going to be okay. Something out there just decided we mattered." },
          ],
        },
      ],
    },
  },
  {
    title: "The Perfect Day Gone Wrong",
    genre: "Comedy",
    synopsis: "A meticulously planned perfect day begins to unravel the moment someone is fifteen minutes late — and things get exponentially worse from there, involving pigeons, ruined cakes, and one very unhelpful stranger.",
    sceneImagePrompt: "chaotic sunny city street, spilled coffee on someone's shirt, pigeons everywhere, a wonky banner that says PERFECT DAY, bright warm colors",
    characters: [
      { id: "planner", name: "The Planner", description: "hyper-organized, increasingly unhinged as plans collapse — voice rising in pitch with each disaster" },
      { id: "late", name: "The Late Friend", description: "genuinely confused why everyone is upset — breezy, oblivious, cheerful to an infuriating degree" },
      { id: "overreactor", name: "The Overreactor", description: "every minor setback is a catastrophe — dramatic, loud, genuinely convinced the world is ending" },
      { id: "chill", name: "The Chill One", description: "absolutely unbothered by any of this — serene to the point of seeming medicated" },
      { id: "stranger", name: "The Random Stranger", description: "only passing through but somehow makes everything worse — helpful in entirely the wrong way" },
    ],
    scriptJson: {
      scenes: [
        {
          scene: 1,
          scene_description: "sunny city street, a beautifully planned picnic setup, one person missing",
          sfx_before: "city sounds, birds chirping, cheerful music that will soon feel ironic",
          lines: [
            { character: "The Planner", emotion: "strained cheerfulness barely covering panic", stability: 0.3, text: "Okay. Okay! It's fine. They're only seventeen minutes late. The schedule had a twelve-minute buffer. We are five minutes into the crisis window. This is manageable." },
            { character: "The Overreactor", emotion: "theatrical despair", stability: 0.1, text: "It's not manageable. The croissants have already peaked. Croissants have a window, and we have missed it. This day is ruined. I'm calling it now." },
            { character: "The Chill One", emotion: "serene, almost transcendently calm", stability: 0.9, text: "The croissants are still croissants. Crumble is just texture." },
            { character: "The Late Friend", emotion: "cheerful, genuinely confused", stability: 0.5, text: "Hey, hi! Sorry, am I late? I thought you said noon. Actually, I might have thought you said one." },
            { character: "The Planner", emotion: "voice cracking", stability: 0.2, text: "I sent a calendar invite. With a reminder. Forty-five minutes ago." },
            { character: "The Late Friend", emotion: "philosophical, breezy", stability: 0.5, text: "Oh, I never accept calendar invites. I find they create a kind of psychic pressure I don't enjoy." },
          ],
        },
        {
          scene: 2,
          scene_description: "things have gotten considerably worse, pigeons involved",
          sfx_before: "pigeon sounds, something crashing, a banner tearing in the wind",
          lines: [
            { character: "The Planner", emotion: "full breakdown approaching, trying to hold it together", stability: 0.1, text: "The pigeons have the cake. I need everyone to acknowledge that the pigeons have the birthday cake and that this is happening." },
            { character: "The Overreactor", emotion: "vindicated screaming", stability: 0.1, text: "I SAID THE DAY WAS RUINED. I CALLED THIS. IN SCENE ONE." },
            { character: "The Chill One", emotion: "watching the pigeons with genuine appreciation", stability: 0.9, text: "Look at how much they're enjoying it, though. They're having a great day." },
            { character: "The Random Stranger", emotion: "helpful, wrong", stability: 0.6, text: "Excuse me, I couldn't help noticing your situation. I have some breadcrumbs in my pocket. Should I..." },
            { character: "The Planner", emotion: "hollow, broken", stability: 0.5, text: "Please don't." },
            { character: "The Random Stranger", emotion: "already doing it", stability: 0.6, text: "I've already started." },
            { character: "The Late Friend", emotion: "delighted, pointing up", stability: 0.4, text: "Oh wow, more pigeons. So many more pigeons. You know what, this is actually really memorable. This is going to be the best birthday we've ever had." },
            { character: "The Planner", emotion: "acceptance, almost peaceful", stability: 0.7, text: "Yeah. Yeah, it kind of is." },
          ],
        },
      ],
    },
  },
];

export async function seedStories(): Promise<void> {
  const existing = await db.select().from(storiesTable);
  if (existing.length > 0) {
    logger.info("Stories already seeded, skipping");
    return;
  }

  logger.info("Seeding stories...");
  for (const story of STORIES) {
    const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(story.sceneImagePrompt)}?width=1280&height=720&nologo=true`;
    await db.insert(storiesTable).values({
      title: story.title,
      genre: story.genre,
      synopsis: story.synopsis,
      characters: story.characters,
      sceneImageUrl: imageUrl,
      sceneImagePrompt: story.sceneImagePrompt,
      scriptJson: story.scriptJson,
    });
  }
  logger.info(`Seeded ${STORIES.length} stories`);
}
