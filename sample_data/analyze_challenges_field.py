#!/usr/bin/env python3
"""
Explore challenges field to understand available metrics
"""
import json

with open('sample_data/match.json', 'r') as f:
    data = json.load(f)

participant = data['info']['participants'][0]
challenges = participant.get('challenges', {})

print("="*80)
print("CHALLENGES FIELD - Available Metrics")
print("="*80)
print(f"\nTotal challenge metrics: {len(challenges)}")
print("\nChallenge keys (first 50):")
for i, key in enumerate(list(challenges.keys())[:50], 1):
    value = challenges[key]
    print(f"{i:2}. {key:50} = {value}")

print("\n\nRELEVANT METRICS BY CATEGORY:")
print("\n1. ECONOMY/TEMPO:")
economy_keys = [k for k in challenges.keys() if any(word in k.lower() for word in ['gold', 'damage', 'cs', 'farm', 'tempo', 'advantage'])]
for key in economy_keys[:15]:
    print(f"  {key}: {challenges[key]}")

print("\n2. OBJECTIVES/MACRO:")
objective_keys = [k for k in challenges.keys() if any(word in k.lower() for word in ['objective', 'dragon', 'baron', 'tower', 'turret', 'inhibitor', 'takedown', 'level', 'solo'])]
for key in objective_keys[:15]:
    print(f"  {key}: {challenges[key]}")

print("\n3. MAP CONTROL/VISION:")
vision_keys = [k for k in challenges.keys() if any(word in k.lower() for word in ['vision', 'ward', 'control', 'sweep', 'stealth'])]
for key in vision_keys[:15]:
    print(f"  {key}: {challenges[key]}")

print("\n4. ERROR RATE/DEATHS:")
error_keys = [k for k in challenges.keys() if any(word in k.lower() for word in ['death', 'died', 'kill', 'survive', 'escape', 'save'])]
for key in error_keys[:15]:
    print(f"  {key}: {challenges[key]}")
