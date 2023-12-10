import dayjs from 'dayjs';

import { slackBotApp } from '@/app';
import {
    createVoteModal,
    createCompletionBlock,
    createVotePostBlock,
} from '@/block';
import voteModel from '@/database/schema/vote-post/model';

/**
 * 새로운 선택지를 입력했을 경우 발동되는 Action 을 처리하는 함수 handleAddSelectOption
 */
export const handleAddSelectOption = () => {
    slackBotApp.action(
        'add_selection',
        async ({ ack, body, client, logger }) => {
            try {
                if (body.type !== 'block_actions' || !body.view) return;
                if (body.actions[0].type !== 'plain_text_input') return;

                const [action] = body.actions;
                const privateMetadata = body.view.private_metadata;

                const prevSelectOptions = privateMetadata
                    ? JSON.parse(body.view.private_metadata)
                    : [];

                if (!action.value) {
                    await ack();
                    return;
                }

                const updatedSelectOption = [
                    ...prevSelectOptions,
                    action.value,
                ];

                await ack();
                const result = await client.views.update({
                    view_id: body.view.id,
                    hash: body.view.hash,
                    view: createVoteModal(updatedSelectOption),
                });
                logger.info(result);
            } catch (error) {
                logger.error(error);
            }
        },
    );
};

/**
 * 새로운 선택지를 입력했을 경우 발동되는 Action 을 처리하는 함수 handleAddSelectOption
 */
export const handleRemoveSelectOption = () => {
    slackBotApp.action(
        'remove_selection',
        async ({ ack, body, client, logger }) => {
            await ack();
            try {
                if (body.type !== 'block_actions' || !body.view) return;
                if (body.actions[0].type !== 'button') return;

                const prevSelectOptions: string[] = JSON.parse(
                    body.view.private_metadata,
                );
                const deletedSelectOption = body.actions[0].value;
                const updatedSelectOptions = prevSelectOptions.filter(
                    (selectOption) => selectOption !== deletedSelectOption,
                );

                const result = await client.views.update({
                    view_id: body.view.id,
                    hash: body.view.hash,
                    view: createVoteModal(updatedSelectOptions),
                });
                logger.info(result);
            } catch (error) {
                logger.error(error);
            }
        },
    );
};

/**
 * 투표 옵션 버튼을 클릭했을 때에 대한 block_id 를 처리하는 함수 handleVoteCurrentOption
 */
export const handleVoteCurrentOption = () => {
    slackBotApp.action(
        'vote_option',
        async ({ ack, body, client, logger }) => {
            await ack();
            try {
                if (body.type !== 'block_actions' || !body.view) return;
                if (body.actions[0].type !== 'button') return;

                const currentVotedOption = body.actions[0].value;
                console.log(currentVotedOption);
            } catch (error) {
                logger.error(error);
            }
        },
    );
};

/**
 * 투표글 생성에 필요한 정보를 기입한 후, 모달을 닫는 view 를 처리하는 함수 handleSubmitVoteModal
 */
export const handleSubmitVoteModal = () => {
    slackBotApp.view(
        'vote_modal',
        async ({ ack, body, view, client, logger }): Promise<void> => {
            try {
                const { title: titleBlock, dueDate: dueDateBlock } =
                    view.state.values;

                const selectOptions: string[] = JSON.parse(
                    body.view.private_metadata || `[]`,
                );

                const { id: userId, name: userName } = body.user;

                const title = titleBlock['plain_text_input-action']['value'];
                const dueDateSecond =
                    dueDateBlock['datepicker-action']['selected_date_time'];

                if (!title) {
                    await ack({
                        response_action: 'errors',
                        errors: {
                            title: '투표글 제목은 반드시 작성해야 합니다!',
                        },
                    });
                    return;
                }

                if (!dueDateSecond) {
                    await ack({
                        response_action: 'errors',
                        errors: {
                            dueDate: '투표 마감 기한은 반드시 설정해야 합니다!',
                        },
                    });
                    return;
                }

                if (dayjs(dueDateSecond * 1000).isBefore(Date.now())) {
                    await ack({
                        response_action: 'errors',
                        errors: {
                            dueDate:
                                '투표 마감 기한은 현재 시각보다 이후여야 합니다.',
                        },
                    });
                    return;
                }

                if (
                    !selectOptions ||
                    selectOptions.length < 1 ||
                    selectOptions.length > 8
                ) {
                    await ack({
                        response_action: 'errors',
                        errors: {
                            option_input:
                                '선택지는 한 개 이상 여덟 개 미만이어야 합니다.',
                        },
                    });
                    return;
                }

                await client.chat.postMessage({
                    channel: userId,
                    text: '투표글 생성이 완료되었습니다!',
                    blocks: createCompletionBlock({
                        title,
                        dueDateSecond,
                        selectOptions,
                    }),
                });

                await client.chat.postMessage({
                    channel: userId,
                    text: '새로운 투표글이 생성되었습니다!',
                    blocks: createVotePostBlock({
                        title,
                        userName,
                        dueDateSecond,
                        selectOptions,
                    }),
                });

                await voteModel.create({
                    title,
                    userId,
                    options: selectOptions.map((option, index) => ({
                        option,
                        index,
                    })),
                    dueDate: new Date(dueDateSecond * 1000),
                });

                // NOTE : 모달을 최종적으로 닫기 위해서는 clear response_action 반환 필요
                const result = await ack({
                    response_action: 'clear',
                });

                logger.info(result);
            } catch (error) {
                logger.error(error);
            }
        },
    );
};
