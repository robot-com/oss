// lib.ts

/**
 * Matches an MQTT topic against a subscription pattern and extracts the wildcard parameters.
 *
 * @param topic The topic string to test (e.g., "system/events/ev123").
 * @param pattern The subscription pattern (e.g., "system/events/+").
 * @returns An array of the captured parameter strings, or `null` if the topic does not match or the pattern is invalid.
 */
export function matchTopic(
    topic: string,
    pattern: string,
): { params: string[] } | null {
    if (!topic || !pattern) {
        return null
    }

    const topicSegments = topic.split('/')
    const patternSegments = pattern.split('/')

    // Handle MQTT shared subscriptions
    if (patternSegments[0] === '$share') {
        if (patternSegments.length < 3) {
            return null // Invalid $share pattern
        }
        patternSegments.splice(0, 2) // Remove $share and group-name
    } else if (patternSegments[0] === '$queue') {
        if (patternSegments.length < 2) {
            return null // Invalid $queue pattern
        }
        patternSegments.shift() // Remove $queue
    }

    const params: string[] = []
    const patternLen = patternSegments.length
    const topicLen = topicSegments.length

    for (let i = 0; i < patternLen; i++) {
        const patternSegment = patternSegments[i]

        if (patternSegment === '#') {
            // # must be the last segment
            if (i !== patternLen - 1) {
                return null
            }
            // Capture the rest of the topic
            params.push(topicSegments.slice(i).join('/'))
            return { params }
        }

        // If we ran out of topic segments but pattern still has more (and not #), no match
        if (i >= topicLen) {
            return null
        }

        const topicSegment = topicSegments[i]

        if (patternSegment === '+') {
            params.push(topicSegment)
        } else if (patternSegment !== topicSegment) {
            return null
        }
    }

    // If pattern finished but topic has more segments, no match (unless handled by # above)
    if (topicLen > patternLen) {
        return null
    }

    return { params }
}
