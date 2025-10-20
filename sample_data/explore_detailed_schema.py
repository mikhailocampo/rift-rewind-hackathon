#!/usr/bin/env python3
"""
Extract key fields from match data for schema design
"""
import json

def analyze_match_detail():
    """Extract key fields from match.json"""
    with open('sample_data/match.json', 'r') as f:
        data = json.load(f)

    print("="*80)
    print("MATCH DATA - Key Fields for Schema")
    print("="*80)

    # Metadata
    metadata = data['metadata']
    print(f"\nMETADATA:")
    print(f"  matchId: {metadata['matchId']}")
    print(f"  participants (PUUIDs): {len(metadata['participants'])} players")
    print(f"    Sample PUUID: {metadata['participants'][0]}")

    # Info - Game level
    info = data['info']
    print(f"\nGAME INFO:")
    print(f"  gameId: {info['gameId']}")
    print(f"  platformId: {info['platformId']}")
    print(f"  gameMode: {info['gameMode']}")
    print(f"  gameType: {info['gameType']}")
    print(f"  gameDuration: {info['gameDuration']}s ({info['gameDuration']//60}min)")
    print(f"  gameStartTimestamp: {info['gameStartTimestamp']} (epoch ms)")
    print(f"  gameEndTimestamp: {info['gameEndTimestamp']} (epoch ms)")
    print(f"  queueId: {info['queueId']}")
    print(f"  mapId: {info['mapId']}")
    print(f"  gameVersion: {info['gameVersion']}")

    # Teams
    print(f"\nTEAMS:")
    for team in info['teams']:
        print(f"  Team {team['teamId']}:")
        print(f"    win: {team['win']}")
        print(f"    objectives: {list(team['objectives'].keys())}")
        if 'bans' in team:
            print(f"    bans: {len(team['bans'])} champions")

    # Participants - Sample first player
    print(f"\nPARTICIPANT FIELDS (First Player):")
    participant = info['participants'][0]
    important_fields = [
        'puuid', 'summonerId', 'summonerName', 'riotIdGameName', 'riotIdTagline',
        'championId', 'championName', 'teamId', 'teamPosition', 'individualPosition',
        'kills', 'deaths', 'assists', 'goldEarned', 'totalDamageDealtToChampions',
        'visionScore', 'champLevel', 'win',
        'item0', 'item1', 'item2', 'item3', 'item4', 'item5', 'item6',
        'summoner1Id', 'summoner2Id'
    ]
    for field in important_fields:
        if field in participant:
            print(f"  {field}: {participant[field]}")

    # Check if challenges exists
    if 'challenges' in participant:
        print(f"\n  challenges (sample keys): {list(participant['challenges'].keys())[:10]}")

    # Check perks structure
    if 'perks' in participant:
        perks = participant['perks']
        print(f"\n  perks structure:")
        print(f"    statPerks: {perks.get('statPerks', {})}")
        if 'styles' in perks:
            print(f"    styles: {len(perks['styles'])} style groups")
            for style in perks['styles']:
                print(f"      - {style['description']}: style={style['style']}")

def analyze_timeline_detail():
    """Extract key fields from MatchTimeline.json"""
    with open('sample_data/MatchTimeline.json', 'r') as f:
        data = json.load(f)

    print("\n" + "="*80)
    print("TIMELINE DATA - Key Fields for Schema")
    print("="*80)

    info = data['info']
    print(f"\nTIMELINE INFO:")
    print(f"  frameInterval: {info['frameInterval']}ms")
    print(f"  Total frames: {len(info['frames'])}")

    # Participants mapping
    print(f"\nPARTICIPANTS MAPPING:")
    for participant in info['participants'][:3]:  # First 3
        print(f"  participantId {participant['participantId']}: {participant['puuid']}")

    # Frame structure
    print(f"\nFRAME STRUCTURE (Frame 5):")
    frame = info['frames'][5]
    print(f"  timestamp: {frame['timestamp']}ms")
    print(f"  events: {len(frame['events'])} events")

    # Sample participant frame data
    print(f"\nPARTICIPANT FRAME DATA (Participant 1, Frame 5):")
    pf = frame['participantFrames']['1']
    print(f"  championStats:")
    for key, value in pf['championStats'].items():
        print(f"    {key}: {value}")
    print(f"  currentGold: {pf['currentGold']}")
    print(f"  goldPerSecond: {pf['goldPerSecond']}")
    print(f"  level: {pf['level']}")
    print(f"  position: {pf['position']}")
    print(f"  totalGold: {pf['totalGold']}")
    print(f"  xp: {pf['xp']}")

    # Sample events
    print(f"\nSAMPLE EVENTS (Frame 10):")
    frame10 = info['frames'][10]
    for event in frame10['events'][:5]:
        print(f"  {event['type']} @ {event['timestamp']}ms")
        if event['type'] == 'CHAMPION_KILL':
            print(f"    killerId: {event.get('killerId')}, victimId: {event.get('victimId')}")
            print(f"    assistingParticipantIds: {event.get('assistingParticipantIds', [])}")
            print(f"    position: {event.get('position')}")
        elif event['type'] == 'BUILDING_KILL':
            print(f"    buildingType: {event.get('buildingType')}, teamId: {event.get('teamId')}")
            print(f"    killerIds: {event.get('killerId')}")

if __name__ == '__main__':
    analyze_match_detail()
    analyze_timeline_detail()
