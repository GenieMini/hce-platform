<script lang="ts">
  import emojiRegex from 'emoji-regex'
  import { createEventDispatcher, getContext } from 'svelte'
  import { IntlString } from '@hcengineering/platform'

  import Label from './Label.svelte'
  import Scroller from './Scroller.svelte'
  import Emoji from './icons/Emoji.svelte'
  import Food from './icons/Food.svelte'
  import Nature from './icons/Nature.svelte'
  import Objects from './icons/Objects.svelte'
  import Places from './icons/Places.svelte'
  import Symbols from './icons/Symbols.svelte'
  import Work from './icons/Work.svelte'
  import Palette from './icons/Palette.svelte'

  import { tooltip } from '../tooltips'
  import { AnySvelteComponent, emojiSP } from '../types'
  import plugin from '../plugin'
  import { fromCodePoint } from '../utils'

  export let embedded = false
  export let selected: string | undefined
  export let disabled: boolean = false

  interface Category {
    id: string
    label: IntlString
    emojis: Array<string | undefined>
    icon: AnySvelteComponent
  }

  let scrollElement: HTMLDivElement

  const regex = emojiRegex()
  const dispatch = createEventDispatcher()
  const { currentFontSize } = getContext<{ currentFontSize: string }>('fontsize')
  const emojiRowHeightPx = (currentFontSize === 'small-font' ? 14 : 16) * 2

  const categories: Category[] = [
    {
      id: 'work',
      label: plugin.string.GettingWorkDone,
      emojis: [
        String.fromCodePoint(0x1f440),
        String.fromCodePoint(0x2705),
        String.fromCodePoint(0x274c),
        String.fromCodePoint(0x2795),
        String.fromCodePoint(0x2796),
        String.fromCodePoint(0x2757),
        String.fromCodePoint(0x0031, 0xfe0f, 0x20e3),
        String.fromCodePoint(0x0032, 0xfe0f, 0x20e3),
        String.fromCodePoint(0x0033, 0xfe0f, 0x20e3),
        String.fromCodePoint(0x1f44b),
        String.fromCodePoint(0x1f44d),
        String.fromCodePoint(0x1f44c),
        String.fromCodePoint(0x1f525),
        String.fromCodePoint(0x1f680)
      ],
      icon: Work
    },
    {
      id: 'smileys',
      label: plugin.string.Smileys,
      emojis: [
        ...getEmojis(0x1f600, 0x1f64b),
        ...getEmojis(0x1f64d, 0x1f64e),
        ...getEmojis(0x1f910, 0x1f917),
        ...getEmojis(0x1f920, 0x1f92f),
        ...getEmojis(0x1fae0, 0x1fae8),
        ...getEmojis(0x1f64f, 0x1f64f),
        ...getEmojis(0x1f64c, 0x1f64c),
        ...getEmojis(0x1f918, 0x1f91f),
        ...getEmojis(0x270a, 0x270d),
        ...getEmojis(0x1f90c, 0x1f90c),
        ...getEmojis(0x1faf0, 0x1faf8),
        ...getEmojis(0x1f446, 0x1f450),
        ...getEmojis(0x1f4aa, 0x1f4aa),
        ...getEmojis(0x1f9be, 0x1f9bf),
        ...getEmojis(0x1f9b5, 0x1f9b7)
      ],
      icon: Emoji
    },
    {
      id: 'nature',
      label: plugin.string.Nature,
      emojis: [
        ...getEmojis(0x1f408, 0x1f43e),
        ...getEmojis(0x1f980, 0x1f9ae),
        ...getEmojis(0x1f330, 0x1f343),
        ...getEmojis(0x1f300, 0x1f320),
        ...getEmojis(0x1f324, 0x1f32c, [0xfe0f]),
        ...getEmojis(0x2600, 0x2604, [0xfe0f])
      ],
      icon: Nature
    },
    {
      id: 'travels',
      label: plugin.string.TravelAndPlaces,
      emojis: [...getEmojis(0x1f5fb, 0x1f5ff), ...getEmojis(0x1f3e0, 0x1f3f0), ...getEmojis(0x1f680, 0x1f6a3)],
      icon: Places
    },
    {
      id: 'food',
      label: plugin.string.Food,
      emojis: [...getEmojis(0x1f345, 0x1f37f), ...getEmojis(0x1f32d, 0x1f32f)],
      icon: Food
    },
    {
      id: 'objects',
      label: plugin.string.Objects,
      emojis: [...getEmojis(0x1f4b6, 0x1f4fc)],
      icon: Objects
    },
    {
      id: 'symbols',
      label: plugin.string.Symbols,
      emojis: [
        ...getEmojis(0x00a9, 0x25fc, [0xfe0f]),
        ...getEmojis(0x2764, 0x2b07, [0xfe0f]),
        ...getEmojis(0x0023, 0x0039, [0xfe0f, 0x20e3]),
        ...getEmojis(0x1f532, 0x1f53d)
      ],
      icon: Symbols
    },
    {
      id: 'express',
      label: plugin.string.ExpressYourself,
      emojis: [
        ...generateSkinToneEmojis(0x1f44b),
        ...generateSkinToneEmojis(0x1f44d),
        ...generateSkinToneEmojis(0x1f44c),
        ...generateSkinToneEmojis(0x1f64c),
        ...generateSkinToneEmojis(0x1f44f),
        ...generateSkinToneEmojis(0x1f64f)
      ],
      icon: Palette
    }
  ]

  let currentCategory = categories[0]

  function getEmojis (startCode: number, endCode: number, postfix?: number[]): Array<string | undefined> {
    return [...Array(endCode - startCode + 1).keys()].map((v) => {
      const str = postfix ? fromCodePoint(v + startCode, ...postfix) : fromCodePoint(v + startCode)
      if ([...str.matchAll(regex)].length > 0) return str
      return undefined
    })
  }

  function generateSkinToneEmojis (baseEmoji: number): string[] {
    const skinTones = [0x1f3fb, 0x1f3fc, 0x1f3fd, 0x1f3fe, 0x1f3ff]
    return skinTones.map((skinTone) => {
      return String.fromCodePoint(baseEmoji, skinTone)
    })
  }

  function handleScrollToCategory (categoryId: string) {
    const labelElement = document.getElementById(categoryId)

    if (labelElement) {
      const emojisElement = labelElement.nextElementSibling as HTMLElement
      scrollElement.scroll(0, emojisElement.offsetTop - (currentFontSize === 'small-font' ? 14 : 16) * 1.75)
    }
  }

  function handleCategoryScrolled () {
    const selectedCategory = categories.find((category) => {
      const labelElement = document.getElementById(category.id)

      if (!labelElement) {
        return false
      }

      const emojisElement = labelElement.nextElementSibling as HTMLElement

      return emojisElement.offsetTop + emojisElement.offsetHeight - emojiRowHeightPx > scrollElement.scrollTop
    })

    if (selectedCategory) {
      currentCategory = selectedCategory
    }
  }
</script>

<div class={!embedded ? 'antiPopup antiPopup-withHeader popup' : 'flex-col'}>
  <div class="flex-row-center popup-header">
    {#each categories as category}
      <!-- svelte-ignore a11y-click-events-have-key-events -->
      <!-- svelte-ignore a11y-no-static-element-interactions -->
      <div
        class="element"
        class:selected={currentCategory.id === category.id}
        use:tooltip={{ label: category.label }}
        on:click={() => {
          handleScrollToCategory(category.id)
        }}
      >
        <svelte:component
          this={category.icon}
          size="medium"
          opacity={currentCategory.id === category.id ? '1' : '0.3'}
        />
      </div>
    {/each}
  </div>
  <div class="scrolling">
    <Scroller
      bind:divScroll={scrollElement}
      fade={emojiSP}
      noStretch
      checkForHeaders
      on:scrolledCategories={handleCategoryScrolled}
    >
      {#each categories as category}
        <div id={category.id} class="scroll-header categoryHeader">
          <Label label={category.label} />
        </div>
        <div class="palette ml-3">
          {#each category.emojis as emoji}
            {#if emoji !== undefined}
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div
                class="element"
                class:selected={emoji === selected}
                class:disabled
                on:click={() => {
                  if (disabled) return

                  dispatch('close', emoji)
                }}
              >
                {emoji}
              </div>
            {/if}
          {/each}
        </div>
      {/each}
    </Scroller>
  </div>
  <div class="ap-space x2" />
</div>

<style lang="scss">
  .popup {
    height: 21.25rem;
  }

  .scrolling {
    min-height: 0;
    height: 16.5rem;
    max-height: 16.5rem;
  }

  .popup-header {
    margin: 0.75rem 0.75rem 0.5rem;
  }

  .scroll-header {
    position: sticky;
    flex-shrink: 0;
    margin: 0.75rem 0.75rem 0.25rem;
    padding: 0.25rem 0.75rem;
    top: 0;
    height: 1.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    color: var(--theme-caption-color);
    background-color: var(--theme-popup-header);
    border-radius: 0.25rem;

    &:first-child {
      margin-top: 0;
    }
  }

  .palette {
    display: flex;
    flex-wrap: wrap;
    // width: 19.25rem;
    font-size: 1.25rem;
  }

  .element {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-shrink: 0;
    width: 1.75rem;
    height: 1.75rem;
    margin: 0.125rem;
    padding: 0.25rem;
    border-radius: 0.25rem;
    color: var(--theme-content-color);
    cursor: pointer;

    &:hover {
      &:not(&.disabled) {
        color: var(--theme-caption-color);
        background-color: var(--theme-popup-hover);
      }
    }

    &.selected {
      background-color: var(--theme-popup-header);
      border: 1px solid var(--theme-popup-divider);
    }

    &.disabled {
      cursor: default;
    }
  }
</style>
