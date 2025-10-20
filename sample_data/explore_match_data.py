#!/usr/bin/env python3
"""
Explore structure of Riot match data without loading everything into memory
"""
import json
import sys
from typing import Any, Dict, List

def get_structure(obj: Any, max_depth: int = 3, current_depth: int = 0, max_array_items: int = 2) -> Any:
    """Recursively get structure of JSON object with depth limiting"""
    if current_depth >= max_depth:
        return f"<depth_limit_reached: {type(obj).__name__}>"

    if isinstance(obj, dict):
        result = {}
        for key, value in obj.items():
            result[key] = get_structure(value, max_depth, current_depth + 1, max_array_items)
        return result
    elif isinstance(obj, list):
        if len(obj) == 0:
            return []
        # Show structure of first few items
        samples = obj[:max_array_items]
        result = [get_structure(item, max_depth, current_depth + 1, max_array_items) for item in samples]
        if len(obj) > max_array_items:
            result.append(f"<...{len(obj) - max_array_items} more items>")
        return result
    else:
        # Return type and sample value for primitives
        return f"{type(obj).__name__}: {repr(obj)[:50]}"

def analyze_match_file(filepath: str):
    """Analyze match.json structure"""
    print(f"\n{'='*80}")
    print(f"Analyzing: {filepath}")
    print(f"{'='*80}\n")

    with open(filepath, 'r') as f:
        data = json.load(f)

    # Get high-level structure
    print("HIGH-LEVEL STRUCTURE:")
    print(json.dumps(get_structure(data, max_depth=2, max_array_items=1), indent=2))

    # Key statistics
    print(f"\n\nKEY STATISTICS:")
    if isinstance(data, dict):
        print(f"Top-level keys: {list(data.keys())}")

        # Check for metadata
        if 'metadata' in data:
            meta = data['metadata']
            print(f"\nMetadata keys: {list(meta.keys()) if isinstance(meta, dict) else type(meta)}")
            if isinstance(meta, dict) and 'participants' in meta:
                print(f"  - Number of participants: {len(meta['participants'])}")

        # Check for info
        if 'info' in data:
            info = data['info']
            print(f"\nInfo keys: {list(info.keys())[:20] if isinstance(info, dict) else type(info)}")
            if isinstance(info, dict):
                if 'participants' in info:
                    print(f"  - Number of participants: {len(info['participants'])}")
                    if len(info['participants']) > 0:
                        print(f"  - Participant keys (first player): {list(info['participants'][0].keys())}")
                if 'teams' in info:
                    print(f"  - Number of teams: {len(info['teams'])}")

def analyze_timeline_file(filepath: str):
    """Analyze MatchTimeline.json structure"""
    print(f"\n{'='*80}")
    print(f"Analyzing: {filepath}")
    print(f"{'='*80}\n")

    with open(filepath, 'r') as f:
        data = json.load(f)

    # Get high-level structure (shallow due to size)
    print("HIGH-LEVEL STRUCTURE:")
    print(json.dumps(get_structure(data, max_depth=2, max_array_items=1), indent=2))

    # Key statistics
    print(f"\n\nKEY STATISTICS:")
    if isinstance(data, dict):
        print(f"Top-level keys: {list(data.keys())}")

        if 'info' in data:
            info = data['info']
            if isinstance(info, dict):
                print(f"\nInfo keys: {list(info.keys())}")

                # Analyze frames
                if 'frames' in info:
                    frames = info['frames']
                    print(f"  - Number of frames: {len(frames)}")
                    if len(frames) > 0:
                        print(f"  - Frame keys (first frame): {list(frames[0].keys())}")

                        # Analyze events in first frame
                        if 'events' in frames[0]:
                            events = frames[0]['events']
                            print(f"    - Events in first frame: {len(events)}")
                            if len(events) > 0:
                                print(f"    - Event keys (first event): {list(events[0].keys())}")
                                # Get unique event types
                                event_types = {}
                                for frame in frames:
                                    if 'events' in frame:
                                        for event in frame['events']:
                                            event_type = event.get('type', 'UNKNOWN')
                                            event_types[event_type] = event_types.get(event_type, 0) + 1
                                print(f"\n  - Event type distribution:")
                                for event_type, count in sorted(event_types.items(), key=lambda x: x[1], reverse=True):
                                    print(f"    {event_type}: {count}")

if __name__ == '__main__':
    analyze_match_file('sample_data/match.json')
    analyze_timeline_file('sample_data/MatchTimeline.json')
