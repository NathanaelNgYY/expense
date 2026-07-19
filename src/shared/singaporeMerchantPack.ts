// Explicit .ts consumers include the Deno-bundled Supabase ingest function.
import type { Category } from '../types.ts'

type MerchantPackRule = {
  category: Category
  aliases: readonly string[]
}

// High-confidence aliases for merchant labels commonly emitted by Apple Wallet
// in Singapore. Keep ambiguous legal entities out of this pack: the generic
// classifier or the user's correction history can handle those safely.
const SINGAPORE_MERCHANT_PACK: readonly MerchantPackRule[] = [
  {
    category: 'lunch',
    aliases: [
      'a w singapore',
      'ajisen ramen',
      'arnolds fried chicken',
      'bengawan solo',
      'blackball',
      'bonchon',
      'boost juice',
      'breadtalk',
      'burger king',
      'chagee',
      'chateraise',
      'chir chir',
      'collins',
      'coffee bean',
      'crystal jade',
      'din tai fung',
      'each a cup',
      'encik tan',
      'eighteen chefs',
      'flash coffee',
      'food republic',
      'four leaves',
      'gong cha',
      'genki sushi',
      'grab food',
      'grabfood',
      'guzman y gomez',
      'hawker chan',
      'jollibee',
      'jollibean',
      'kfc',
      'koi the',
      'kopitiam',
      'koufu',
      'liho',
      'luckin coffee',
      'm cafe',
      'mccafe',
      'mcdonald',
      'mcdonalds',
      'mixue',
      'mos burger',
      'mr bean',
      'mr coconut',
      'nam kee pau',
      'nandos',
      'old chang kee',
      'pappa rich',
      'paris baguette',
      'pastamania',
      'pepper lunch',
      'playmade',
      'poulet',
      'putien',
      'qi ji',
      'raffles medical cafe',
      'riverside grilled fish',
      'saizeriya',
      'seoul garden',
      'shake shack',
      'shihlin taiwan street snacks',
      'song fa',
      'soup restaurant',
      'starbucks',
      'stuffd',
      'subway',
      'sushi express',
      'swee heng',
      'swensens',
      'tangled fresh pasta',
      'tenderfresh',
      'the soup spoon',
      'toast box',
      'tori q',
      'twelve cupcakes',
      'wingstop',
      'wok hey',
      'ya kun',
      'yo chi',
      'yochi',
    ],
  },
  {
    category: 'transport',
    aliases: [
      'cdg zig',
      'comfortdelgro',
      'gojek',
      'sbs transit',
      'simplygo',
      'smrt',
      'transit link',
      'transitlink',
    ],
  },
  {
    category: 'others',
    aliases: [
      '7 eleven',
      'cheers',
      'cold storage',
      'daiso',
      'decathlon',
      'don don donki',
      'fairprice',
      'fairprice finest',
      'guardian',
      'ikea',
      'miniso',
      'muji',
      'ntuc fairprice',
      'popular bookstore',
      'sheng siong',
      'uniqlo',
      'watsons',
    ],
  },
]

function containsAlias(normalizedMerchant: string, alias: string): boolean {
  return ` ${normalizedMerchant} `.includes(` ${alias} `)
}

export function categoryFromSingaporeMerchantPack(normalizedMerchant: string): Category | null {
  if (!normalizedMerchant) return null

  for (const rule of SINGAPORE_MERCHANT_PACK) {
    if (rule.aliases.some(alias => containsAlias(normalizedMerchant, alias))) {
      return rule.category
    }
  }

  return null
}
