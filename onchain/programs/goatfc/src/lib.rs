// GoatFC — on-chain penalty betting (commit–reveal provable fairness).
//
// SCAFFOLD: this compiles under Anchor but has NOT been audited or tested.
// Do not hold mainnet funds until you have written tests, run on devnet, and
// had an independent security audit.
//
// Model: the house commits sha256(server_seed) up front. Players place bets
// into a program vault. To settle, the house reveals server_seed; the program
// verifies the hash and derives the outcome from
//   keccak256(server_seed || player || nonce)
// so neither side can change a result after the commit.
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{keccak, hash, system_instruction, program::{invoke, invoke_signed}};

declare_id!("D4XN8m2M8BBitfPpb3jNe3ji3TC5pnP4pcAmhSxwgr7p");

const MAIN_BPS: u128 = 19_800; // x1.98  (basis points / 10_000)
const ZONE_BPS: u128 = 99_000; // x9.90
const P_GOAL_NUM: u32 = 50;    // 50% goal probability (of 100)

#[program]
pub mod goatfc {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, commit: [u8; 32]) -> Result<()> {
        let h = &mut ctx.accounts.house;
        h.authority = ctx.accounts.authority.key();
        h.commit = commit;
        h.vault_bump = ctx.bumps.vault;
        h.house_bump = ctx.bumps.house;
        Ok(())
    }

    /// Rotate the committed server-seed hash for a new epoch.
    pub fn set_commit(ctx: Context<AdminHouse>, commit: [u8; 32]) -> Result<()> {
        ctx.accounts.house.commit = commit;
        Ok(())
    }

    /// Fund the vault with SOL liquidity for payouts.
    pub fn fund(ctx: Context<Fund>, lamports: u64) -> Result<()> {
        invoke(
            &system_instruction::transfer(&ctx.accounts.funder.key(), &ctx.accounts.vault.key(), lamports),
            &[ctx.accounts.funder.to_account_info(), ctx.accounts.vault.to_account_info(), ctx.accounts.system_program.to_account_info()],
        )?;
        Ok(())
    }

    /// Place a bet. pick: 0 = GOAL, 1 = MISS. zone: 0..4 corner, 255 = none.
    pub fn place_bet(ctx: Context<PlaceBet>, nonce: u64, amount: u64, zone_stake: u64, pick: u8, zone: u8) -> Result<()> {
        require!(pick <= 1, GoatErr::BadPick);
        require!(amount > 0, GoatErr::BadStake);
        let total = amount.checked_add(zone_stake).ok_or(GoatErr::Overflow)?;
        invoke(
            &system_instruction::transfer(&ctx.accounts.player.key(), &ctx.accounts.vault.key(), total),
            &[ctx.accounts.player.to_account_info(), ctx.accounts.vault.to_account_info(), ctx.accounts.system_program.to_account_info()],
        )?;
        let b = &mut ctx.accounts.bet;
        b.player = ctx.accounts.player.key();
        b.nonce = nonce;
        b.amount = amount;
        b.zone_stake = zone_stake;
        b.pick = pick;
        b.zone = zone;
        b.commit = ctx.accounts.house.commit; // bind to the live commitment
        b.settled = false;
        Ok(())
    }

    /// Settle a bet by revealing the server seed. Authority-only.
    pub fn settle(ctx: Context<Settle>, server_seed: Vec<u8>) -> Result<()> {
        let bet = &mut ctx.accounts.bet;
        require!(!bet.settled, GoatErr::AlreadySettled);
        // verify reveal matches the commitment this bet was bound to
        let digest = hash::hash(&server_seed);
        require!(digest.to_bytes() == bet.commit, GoatErr::BadReveal);

        // provably-fair outcome: keccak(seed || player || nonce)
        let out = keccak::hashv(&[&server_seed, bet.player.as_ref(), &bet.nonce.to_le_bytes()]);
        let r = u32::from_le_bytes([out.0[0], out.0[1], out.0[2], out.0[3]]);
        let scored = (r % 100) < P_GOAL_NUM;                 // true = GOAL
        let land = (keccak::hashv(&[&server_seed, &bet.nonce.to_le_bytes(), b"zone"]).0[0] % 5) as u8;

        let main_win = (bet.pick == 0 && scored) || (bet.pick == 1 && !scored);
        let zone_win = bet.zone != 255 && scored && land == bet.zone;
        let mut payout: u128 = 0;
        if main_win { payout += (bet.amount as u128) * MAIN_BPS / 10_000; }
        if zone_win { payout += (bet.zone_stake as u128) * ZONE_BPS / 10_000; }
        let payout = payout as u64;

        if payout > 0 {
            let seeds: &[&[u8]] = &[b"vault", &[ctx.accounts.house.vault_bump]];
            invoke_signed(
                &system_instruction::transfer(&ctx.accounts.vault.key(), &bet.player, payout),
                &[ctx.accounts.vault.to_account_info(), ctx.accounts.player.to_account_info(), ctx.accounts.system_program.to_account_info()],
                &[seeds],
            )?;
        }
        bet.settled = true;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 8 + House::LEN, seeds = [b"house"], bump)]
    pub house: Account<'info, House>,
    /// CHECK: SOL vault PDA (system account)
    #[account(seeds = [b"vault"], bump)]
    pub vault: SystemAccount<'info>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminHouse<'info> {
    #[account(mut, seeds = [b"house"], bump = house.house_bump, has_one = authority)]
    pub house: Account<'info, House>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct Fund<'info> {
    #[account(mut, seeds = [b"vault"], bump)]
    pub vault: SystemAccount<'info>,
    #[account(mut)]
    pub funder: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct PlaceBet<'info> {
    #[account(seeds = [b"house"], bump = house.house_bump)]
    pub house: Account<'info, House>,
    #[account(init, payer = player, space = 8 + Bet::LEN, seeds = [b"bet", player.key().as_ref(), &nonce.to_le_bytes()], bump)]
    pub bet: Account<'info, Bet>,
    #[account(mut, seeds = [b"vault"], bump = house.vault_bump)]
    pub vault: SystemAccount<'info>,
    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(seeds = [b"house"], bump = house.house_bump, has_one = authority)]
    pub house: Account<'info, House>,
    #[account(mut, close = authority, has_one = player)]
    pub bet: Account<'info, Bet>,
    #[account(mut, seeds = [b"vault"], bump = house.vault_bump)]
    pub vault: SystemAccount<'info>,
    /// CHECK: paid out to; validated by bet.has_one = player
    #[account(mut)]
    pub player: UncheckedAccount<'info>,
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct House { pub authority: Pubkey, pub commit: [u8; 32], pub vault_bump: u8, pub house_bump: u8 }
impl House { pub const LEN: usize = 32 + 32 + 1 + 1; }

#[account]
pub struct Bet { pub player: Pubkey, pub nonce: u64, pub amount: u64, pub zone_stake: u64, pub pick: u8, pub zone: u8, pub commit: [u8; 32], pub settled: bool }
impl Bet { pub const LEN: usize = 32 + 8 + 8 + 8 + 1 + 1 + 32 + 1; }

#[error_code]
pub enum GoatErr {
    #[msg("bad pick")] BadPick,
    #[msg("bad stake")] BadStake,
    #[msg("overflow")] Overflow,
    #[msg("already settled")] AlreadySettled,
    #[msg("reveal does not match commit")] BadReveal,
}
