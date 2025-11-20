
        INSERT INTO oracle.oddyssey_slips (
          slip_id, cycle_id, player_address, placed_at, predictions, 
          final_score, correct_count, is_evaluated, leaderboard_rank, prize_claimed
        ) VALUES (
          'slip_0xA336C7B8cBe75D5787F25A62FE282B83Ac0f3363_1755732093655_1',
          3,
          '0xA336C7B8cBe75D5787F25A62FE282B83Ac0f3363',
          '2025-08-20T23:21:33.655Z',
          '[{"fixture_id":"19539273","prediction":"1","market":"1X2"},{"fixture_id":"19539271","prediction":"Over","market":"OU25"},{"fixture_id":"19506056","prediction":"2","market":"1X2"}]',
          NULL,
          NULL,
          false,
          NULL,
          false
        )
        ON CONFLICT (slip_id) DO UPDATE SET
          cycle_id = EXCLUDED.cycle_id,
          player_address = EXCLUDED.player_address,
          placed_at = EXCLUDED.placed_at,
          predictions = EXCLUDED.predictions,
          final_score = EXCLUDED.final_score,
          correct_count = EXCLUDED.correct_count,
          is_evaluated = EXCLUDED.is_evaluated,
          leaderboard_rank = EXCLUDED.leaderboard_rank,
          prize_claimed = EXCLUDED.prize_claimed;
      

        INSERT INTO oracle.oddyssey_slips (
          slip_id, cycle_id, player_address, placed_at, predictions, 
          final_score, correct_count, is_evaluated, leaderboard_rank, prize_claimed
        ) VALUES (
          'slip_0xA336C7B8cBe75D5787F25A62FE282B83Ac0f3363_1755732093661_2',
          3,
          '0xA336C7B8cBe75D5787F25A62FE282B83Ac0f3363',
          '2025-08-20T23:21:33.661Z',
          '[{"fixture_id":"19387043","prediction":"X","market":"1X2"},{"fixture_id":"19510843","prediction":"Under","market":"OU25"},{"fixture_id":"19510844","prediction":"1","market":"1X2"}]',
          NULL,
          NULL,
          false,
          NULL,
          false
        )
        ON CONFLICT (slip_id) DO UPDATE SET
          cycle_id = EXCLUDED.cycle_id,
          player_address = EXCLUDED.player_address,
          placed_at = EXCLUDED.placed_at,
          predictions = EXCLUDED.predictions,
          final_score = EXCLUDED.final_score,
          correct_count = EXCLUDED.correct_count,
          is_evaluated = EXCLUDED.is_evaluated,
          leaderboard_rank = EXCLUDED.leaderboard_rank,
          prize_claimed = EXCLUDED.prize_claimed;
      

        INSERT INTO oracle.oddyssey_slips (
          slip_id, cycle_id, player_address, placed_at, predictions, 
          final_score, correct_count, is_evaluated, leaderboard_rank, prize_claimed
        ) VALUES (
          'slip_0xA336C7B8cBe75D5787F25A62FE282B83Ac0f3363_1755732093661_3',
          3,
          '0xA336C7B8cBe75D5787F25A62FE282B83Ac0f3363',
          '2025-08-20T23:21:33.661Z',
          '[{"fixture_id":"19510845","prediction":"2","market":"1X2"},{"fixture_id":"19538175","prediction":"Over","market":"OU25"},{"fixture_id":"19506054","prediction":"1","market":"1X2"}]',
          NULL,
          NULL,
          false,
          NULL,
          false
        )
        ON CONFLICT (slip_id) DO UPDATE SET
          cycle_id = EXCLUDED.cycle_id,
          player_address = EXCLUDED.player_address,
          placed_at = EXCLUDED.placed_at,
          predictions = EXCLUDED.predictions,
          final_score = EXCLUDED.final_score,
          correct_count = EXCLUDED.correct_count,
          is_evaluated = EXCLUDED.is_evaluated,
          leaderboard_rank = EXCLUDED.leaderboard_rank,
          prize_claimed = EXCLUDED.prize_claimed;
      